// Motor de prioridades y ubicación de racks, basado en las fórmulas de Power BI.
// No depende de Firebase: lo usan la página y el script de carga.

export const RACKS = "ABCDEFGHIJKL".split("");
export const POSICIONES = 30;
export const NIVELES = [0, 1, 2, 3, 4, 5];
export const NIVELES_CHICA = [0, 1, 2, 3];
export const NIVELES_GRANDE = [4, 5];
export const LIMITE_CHICA = 50;
export const FRECUENCIAS = { semanal: "Cada semana", quincenal: "Cada quincena", mensual: "Cada mes" };
export const FRECUENCIA_DEFAULT = "mensual";

export function idUbicacion(rack, posicion, nivel) {
  return `${rack}${posicion}-N${nivel}`;
}

export function parsearUbicacion(texto) {
  const m = /^([A-L])([1-9]|[12]\d|30)-N([0-5])$/.exec(texto || "");
  return m ? { rack: m[1], posicion: Number(m[2]), nivel: Number(m[3]) } : null;
}

export function nivelesPermitidos(tamano) {
  if (tamano === "chica") return NIVELES_CHICA;
  if (tamano === "grande") return NIVELES_GRANDE;
  return NIVELES;
}

export function zonaDeRack(rack) {
  return Math.floor(RACKS.indexOf(rack) / 2) + 1;
}

function prioridadUbicacion({ rack, posicion, nivel }) {
  return RACKS.indexOf(rack) * 180 + (posicion - 1) * 6 + nivel + 1;
}

// Una pieza es chica solo si sus tres medidas están por debajo del límite.
export function tamanoDeMedidas(medidas) {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(medidas || "");
  if (!m) return null;
  return [m[1], m[2], m[3]].every(v => Number(v) < LIMITE_CHICA) ? "chica" : "grande";
}

export const claveCliente = (valor) => String(valor ?? "").trim().toUpperCase();
export const claveEstandar = (valor) => String(valor ?? "").trim().toUpperCase();

export function periodoDe(frecuencia, fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  if (frecuencia === "quincenal") return `${anio}-${mes}-Q${fecha.getDate() <= 15 ? 1 : 2}`;
  if (frecuencia === "semanal") {
    const d = new Date(Date.UTC(anio, fecha.getMonth(), fecha.getDate()));
    const diaSemana = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
    const inicio = Date.UTC(d.getUTCFullYear(), 0, 1);
    const semana = Math.ceil(((d - inicio) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-S${String(semana).padStart(2, "0")}`;
  }
  return `${anio}-${mes}`;
}

function rankingDenso(entradas, comparar) {
  const ordenadas = [...entradas].sort(comparar);
  const ranking = {};
  let rango = 0;
  let anterior = null;
  ordenadas.forEach(e => {
    if (anterior === null || comparar(anterior, e) !== 0) rango++;
    ranking[e.clave] = rango;
    anterior = e;
  });
  return ranking;
}

// piezas: [{ cliente, estandar, fecha: Date | null }], una por folio.
// Cliente: total de folios del histórico. Estándar: promedio mensual de los últimos 3 meses con datos;
// el total del histórico desempata para que los estándares sin movimiento reciente no empaten todos.
export function calcularPesos(piezas) {
  const fechas = piezas.map(p => p.fecha?.getTime()).filter(Boolean);
  const ultima = fechas.length ? Math.max(...fechas) : Date.now();
  const inicioVentana = new Date(ultima);
  inicioVentana.setMonth(inicioVentana.getMonth() - 3);

  const clientes = new Map();
  const estandares = new Map();
  piezas.forEach(p => {
    const cliente = claveCliente(p.cliente);
    const estandar = claveEstandar(p.estandar);
    if (cliente) clientes.set(cliente, (clientes.get(cliente) || 0) + 1);
    if (estandar) {
      const e = estandares.get(estandar) || { total: 0, recientes: 0 };
      e.total++;
      if (p.fecha && p.fecha >= inicioVentana) e.recientes++;
      estandares.set(estandar, e);
    }
  });

  return {
    clientes: rankingDenso([...clientes].map(([clave, total]) => ({ clave, total })), (a, b) => b.total - a.total),
    estandares: rankingDenso(
      [...estandares].map(([clave, e]) => ({ clave, ...e })),
      (a, b) => (b.recientes - a.recientes) || (b.total - a.total)
    )
  };
}

function prioridadDeRango(rango) {
  if (rango && rango <= 3) return "Alta";
  if (rango && rango <= 10) return "Media";
  return "Baja";
}

const VALOR_PRIORIDAD = { Alta: 1, Media: 2, Baja: 3 };

export function evaluarPrioridad(cliente, estandar, pesos) {
  const prioridadCliente = prioridadDeRango(pesos?.clientes?.[claveCliente(cliente)]);
  const prioridadEstandar = prioridadDeRango(pesos?.estandares?.[claveEstandar(estandar)]);
  const orden = (VALOR_PRIORIDAD[prioridadCliente] - 1) * 3 + VALOR_PRIORIDAD[prioridadEstandar];
  const zona = orden <= 2 ? 1 : orden === 3 ? 2 : orden <= 5 ? 3 : orden === 6 ? 4 : orden <= 8 ? 5 : 6;
  return { prioridadCliente, prioridadEstandar, orden, zona };
}

const TODAS_LAS_UBICACIONES = RACKS.flatMap(rack =>
  Array.from({ length: POSICIONES }, (_, i) => i + 1).flatMap(posicion =>
    NIVELES.map(nivel => {
      const u = { rack, posicion, nivel };
      return { ...u, id: idUbicacion(rack, posicion, nivel), zona: zonaDeRack(rack), prioridad: prioridadUbicacion(u) };
    })
  )
);

export function capacidad(tamano) {
  return nivelesPermitidos(tamano).length * RACKS.length * POSICIONES;
}

// Devuelve la primera ubicación libre, de la zona objetivo hacia las más cercanas; null si no hay lugar.
// Sin medidas la pieza se trata como chica.
export function recomendarUbicacion({ cliente, estandar, tamano }, pesos, ocupadas) {
  const evaluacion = evaluarPrioridad(cliente, estandar, pesos);
  const niveles = nivelesPermitidos(tamano || "chica");
  let mejor = null;
  let mejorDistancia = Infinity;
  for (const u of TODAS_LAS_UBICACIONES) {
    if (!niveles.includes(u.nivel) || ocupadas[u.id]) continue;
    const distancia = Math.abs(u.zona - evaluacion.zona);
    if (distancia < mejorDistancia || (distancia === mejorDistancia && u.prioridad < mejor.prioridad)) {
      mejor = u;
      mejorDistancia = distancia;
    }
  }
  return { ...evaluacion, ubicacion: mejor ? mejor.id : null };
}

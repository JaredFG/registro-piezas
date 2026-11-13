import { ALTURA_MAXIMA_CATALOGO } from "./catalogo.js";

// Motor de prioridades y ubicación de racks, basado en las fórmulas de Power BI.
// No depende de Firebase: lo usan la página y el script de carga.

export const RACKS = "ABCDEFGHIJKL".split("");
export const POSICIONES = 30;
export const NIVELES = [0, 1, 2, 3, 4, 5];
export const NIVELES_CHICA = [0, 1, 2, 3];
export const NIVELES_GRANDE = [4, 5];
export const LIMITE_CHICA = 50;
// Límites físicos del rack: cada nivel mide 96 x 96 pulgadas y tiene su propia altura libre.
// N5 no tiene techo definido; se usa la altura de la pieza más alta del catálogo.
export const LARGO_NIVEL = 96;
export const ANCHO_NIVEL = 96;
export const MEDIDA_MINIMA = 20; // pieza más chica del catálogo: con menos largo libre no cabe otra
export const ALTURA_NIVEL = [30, 30, 40, 25, 25, ALTURA_MAXIMA_CATALOGO];
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

// Estibable: N0 a N2. No estibable y una sola pieza: N5. No estibable y varias piezas: N3 o N4.
export function nivelesPorEstiba({ estibable, unica }) {
  if (estibable) return [0, 1, 2];
  return unica ? [5] : [3, 4];
}

// Medidas internas "largoxancho" o "largoxanchoxalto" (alto null si no se conoce).
export function parsearMedidas(medidas) {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?$/.exec(medidas || "");
  return m ? { largo: Number(m[1]), ancho: Number(m[2]), alto: m[3] === undefined ? null : Number(m[3]) } : null;
}

export function largoDeMedidas(medidas) {
  return parsearMedidas(medidas)?.largo ?? null;
}

export function altoDeMedidas(medidas) {
  return parsearMedidas(medidas)?.alto ?? null;
}

// Una pieza cabe en un nivel si entra en sus 96 x 96 pulgadas y, cuando se conoce su alto, en la altura del nivel.
export function cabeEnNivel(medidas, nivel) {
  const m = parsearMedidas(medidas);
  return Boolean(m) && m.largo <= LARGO_NIVEL && m.ancho <= ANCHO_NIVEL && (m.alto === null || m.alto <= ALTURA_NIVEL[nivel]);
}

export function cabeEnRack(medidas) {
  return NIVELES.some(n => cabeEnNivel(medidas, n));
}

// ---- Contenido de cada ubicación ----
// Una ubicación guarda sus estibas: { estibas: [{ p: [piezas de abajo hacia arriba], l: largo en pulgadas, a: alto conocido acumulado, c: estiba completa }] }.
// Los registros anteriores (texto con la pieza, o true) cuentan como una estiba completa que ocupa todo el nivel.
export function normalizarCelda(valor) {
  if (!valor) return { estibas: [] };
  if (typeof valor === "object" && Array.isArray(valor.estibas)) return valor;
  return { estibas: [{ p: typeof valor === "string" ? [valor] : [], l: LARGO_NIVEL, c: true }] };
}

export function largoUsado(valor) {
  return normalizarCelda(valor).estibas.reduce((total, e) => total + e.l, 0);
}

export function piezasDeCelda(valor) {
  return normalizarCelda(valor).estibas.flatMap(e => e.p);
}

// "libre", "parcial" (todavía admite una pieza) o "completa" (sin espacio horizontal ni vertical).
export function estadoCelda(valor) {
  const { estibas } = normalizarCelda(valor);
  if (!estibas.length) return "libre";
  const hayEspacio = largoUsado(valor) + MEDIDA_MINIMA <= LARGO_NIVEL;
  return hayEspacio || estibas.some(e => !e.c) ? "parcial" : "completa";
}

// Devuelve cómo cabe la pieza: { modo: "encima", indice } sobre una estiba abierta, { modo: "lado" } en el largo libre, o null.
export function modoDeColocacion(valor, { largo, alto = null, estibable, nivel }) {
  const { estibas } = normalizarCelda(valor);
  if (estibable) {
    // Encima solo si la altura conocida de la estiba más esta pieza cabe en el nivel; con alto desconocido decide el operador.
    const indice = estibas.findIndex(e => !e.c && (alto === null || nivel === undefined || (e.a || 0) + alto <= ALTURA_NIVEL[nivel]));
    if (indice >= 0) return { modo: "encima", indice };
  }
  return largoUsado(valor) + largo <= LARGO_NIVEL ? { modo: "lado" } : null;
}

// completa: ya no caben más piezas encima de esta estiba.
export function colocarEnCelda(valor, { pieza, largo, alto = null, estibable, completa }, colocacion) {
  const estibas = normalizarCelda(valor).estibas.map(e => ({ ...e, p: [...e.p] }));
  if (colocacion.modo === "encima") {
    estibas[colocacion.indice].p.push(pieza);
    estibas[colocacion.indice].a = (estibas[colocacion.indice].a || 0) + (alto || 0);
    estibas[colocacion.indice].c = Boolean(completa);
  } else {
    estibas.push({ p: [pieza], l: largo, a: alto || 0, c: estibable ? Boolean(completa) : true });
  }
  return { estibas };
}

// Devuelve el contenido nuevo, o null si la ubicación queda vacía.
export function retirarDeCelda(valor, pieza) {
  const estibas = normalizarCelda(valor).estibas
    .map(e => ({ ...e, p: e.p.filter(id => id !== pieza) }))
    .filter(e => e.p.length);
  return estibas.length ? { estibas } : null;
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

// Devuelve la primera ubicación con lugar, de la zona objetivo hacia las más cercanas; null si no hay lugar.
// Con "estibable" definido aplica las reglas de estiba y de largo del nivel; sin él (cargas históricas)
// usa el tamaño de la pieza y pide el nivel completo libre.
export function recomendarUbicacion({ cliente, estandar, tamano, estibable, unica, largo, ancho, alto = null }, pesos, ocupadas) {
  const evaluacion = evaluarPrioridad(cliente, estandar, pesos);
  const conEstiba = typeof estibable === "boolean";
  const niveles = conEstiba
    ? nivelesPorEstiba({ estibable, unica }).filter(n => cabeEnNivel([largo, ancho, alto].filter(v => v !== null).join("x"), n))
    : nivelesPermitidos(tamano || "chica");
  const pieza = { largo: conEstiba ? largo : LARGO_NIVEL, alto: conEstiba ? alto : null, estibable: conEstiba && estibable };
  let mejor = null;
  let mejorColocacion = null;
  let mejorDistancia = Infinity;
  for (const u of TODAS_LAS_UBICACIONES) {
    if (!niveles.includes(u.nivel)) continue;
    const colocacion = modoDeColocacion(ocupadas[u.id], { ...pieza, nivel: u.nivel });
    if (!colocacion) continue;
    const distancia = Math.abs(u.zona - evaluacion.zona);
    if (distancia < mejorDistancia || (distancia === mejorDistancia && u.prioridad < mejor.prioridad)) {
      mejor = u;
      mejorColocacion = colocacion;
      mejorDistancia = distancia;
    }
  }
  return { ...evaluacion, ubicacion: mejor ? mejor.id : null, colocacion: mejorColocacion };
}

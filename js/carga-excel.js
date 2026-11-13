// Lectura, validación y asignación de ubicaciones para la carga de piezas desde Excel.
// No depende del navegador ni de Firebase: recibe la matriz de celdas ya leída del archivo.

import {
  LARGO_NIVEL, ANCHO_NIVEL, cabeEnRack, parsearMedidas, tamanoDeMedidas, evaluarPrioridad, colocarEnCelda, recomendarUbicacion
} from "./optimizacion.js";
import { buscarMedida, medidasDeCatalogo } from "./catalogo.js";

export const ZONA_SIN_RACK = "Por preparar";
export const MAXIMO_FILAS = 5000;

const sinAcentos = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Nombre mostrado, clave interna y alias aceptados (sin acentos ni mayúsculas).
export const COLUMNAS = [
  { clave: "pieza", nombre: "Pieza", obligatoria: true, alias: ["pieza", "id pieza"] },
  { clave: "estandar", nombre: "Estándar", obligatoria: true, alias: ["estandar", "estandar de la pieza", "std"] },
  { clave: "cliente", nombre: "Cliente", obligatoria: true, alias: ["cliente"] },
  { clave: "folio", nombre: "Folio", alias: ["folio"] },
  { clave: "op", nombre: "OP", alias: ["op"] },
  { clave: "material", nombre: "Material", alias: ["material"] },
  { clave: "cantidad", nombre: "Cantidad", alias: ["cantidad"] },
  { clave: "factura", nombre: "Factura", alias: ["factura"] },
  { clave: "fechaFactura", nombre: "Fecha factura", alias: ["fecha factura", "fecha de factura"] },
  { clave: "tipo", nombre: "Tarima o caja", alias: ["tarima o caja", "tarima/caja", "medida", "medidas"] },
  { clave: "estibable", nombre: "Estibable", alias: ["estibable", "se puede estibar"] },
  { clave: "unica", nombre: "Una sola pieza", alias: ["una sola pieza", "unica", "es una sola pieza"] },
  { clave: "masEncima", nombre: "Mas piezas encima", alias: ["mas piezas encima", "caben mas piezas encima"] },
  { clave: "fechaLiberacion", nombre: "Fecha liberacion", alias: ["fecha liberacion", "fecha de liberacion"] },
  { clave: "comentarios", nombre: "Comentarios", alias: ["comentarios"] },
  { clave: "operador", nombre: "Operador", alias: ["operador"] },
  { clave: "equipo", nombre: "Equipo", alias: ["equipo"] }
];

const textoDe = (v) => (v === null || v === undefined ? "" : String(v).trim());
const esNumero = (t) => /^\d+(\.\d+)?$/.test(t);

// Excel guarda las fechas como Date (con cellDates) o como texto aaaa-mm-dd / dd/mm/aaaa.
function fechaIso(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const d = new Date(valor.getTime() + 12 * 3600 * 1000);
    return construirFecha(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  const t = textoDe(valor);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return construirFecha(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return construirFecha(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function construirFecha(anio, mes, dia) {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (anio < 2000 || anio > 2100 || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function siNo(valor) {
  const t = sinAcentos(textoDe(valor));
  if (["si", "s", "true", "1", "yes"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return undefined;
}

// Devuelve { filas, errores, avisos }. Cada error: { fila, columna, motivo }; fila 0 son problemas de todo el archivo.
export function validarMatriz(matriz, { equipos = [] } = {}) {
  const errores = [];
  const avisos = [];
  const error = (fila, columna, motivo) => errores.push({ fila, columna, motivo });

  if (!matriz || !matriz.length) {
    error(0, "", "El archivo no tiene datos.");
    return { filas: [], errores, avisos };
  }

  const indice = {};
  matriz[0].forEach((encabezado, i) => {
    const t = sinAcentos(textoDe(encabezado));
    if (!t) return;
    const columna = COLUMNAS.find(c => c.alias.includes(t));
    if (!columna) {
      error(1, textoDe(encabezado), "Columna no reconocida. Revisa el nombre con la plantilla.");
    } else if (columna.clave in indice) {
      error(1, columna.nombre, "La columna está repetida.");
    } else {
      indice[columna.clave] = i;
    }
  });
  COLUMNAS.filter(c => c.obligatoria && !(c.clave in indice)).forEach(c => error(1, c.nombre, "Falta la columna obligatoria."));
  if (errores.length) return { filas: [], errores, avisos };

  const equiposPorClave = new Map(equipos.map(e => [sinAcentos(e), e]));
  const filas = [];
  const vistas = new Map();
  const datos = matriz.slice(1);
  if (datos.length > MAXIMO_FILAS) error(0, "", `El archivo tiene más de ${MAXIMO_FILAS} filas. Divídelo en varios archivos.`);

  datos.slice(0, MAXIMO_FILAS).forEach((celdas, i) => {
    const fila = i + 2;
    const leer = (clave) => (clave in indice ? celdas[indice[clave]] : undefined);
    if (celdas.every(c => textoDe(c) === "")) return;
    const errorFila = (columna, motivo) => error(fila, columna, motivo);

    const pieza = textoDe(leer("pieza")).toUpperCase();
    if (!pieza) errorFila("Pieza", "Está vacía.");
    else if (pieza.includes("/") || pieza === "." || pieza === "..") errorFila("Pieza", "No puede llevar el carácter \"/\" ni ser \".\" o \"..\".");
    else if (pieza.length > 150) errorFila("Pieza", "Es demasiado larga (máximo 150 caracteres).");
    else if (vistas.has(pieza)) errorFila("Pieza", `Está repetida; ya aparece en la fila ${vistas.get(pieza)}.`);
    else vistas.set(pieza, fila);

    const estandar = textoDe(leer("estandar"));
    if (!estandar) errorFila("Estándar", "Está vacío.");
    const cliente = textoDe(leer("cliente"));
    if (!cliente) errorFila("Cliente", "Está vacío.");

    const textoCantidad = textoDe(leer("cantidad"));
    let cantidad = null;
    if (textoCantidad !== "") {
      if (/^\d+$/.test(textoCantidad)) cantidad = Number(textoCantidad);
      else errorFila("Cantidad", `"${textoCantidad}" no es un número entero mayor o igual a cero.`);
    }

    const textoFactura = textoDe(leer("factura"));
    let factura = null;
    if (textoFactura !== "") {
      if (/^\d+$/.test(textoFactura)) factura = Number(textoFactura);
      else errorFila("Factura", `"${textoFactura}" no es un número; la factura solo lleva dígitos.`);
    }

    const fechas = {};
    [["fechaFactura", "Fecha factura"], ["fechaLiberacion", "Fecha liberacion"]].forEach(([clave, nombre]) => {
      const crudo = leer(clave);
      if (textoDe(crudo) === "") { fechas[clave] = ""; return; }
      const iso = fechaIso(crudo);
      if (iso) fechas[clave] = iso;
      else errorFila(nombre, `"${textoDe(crudo)}" no es una fecha válida. Usa aaaa-mm-dd o dd/mm/aaaa.`);
    });

    // La tarima o caja se elige del catálogo (misma lista que el formulario de registro); de ella salen las medidas.
    const textoTipo = textoDe(leer("tipo"));
    const opcion = textoTipo === "" ? null : buscarMedida(textoTipo);
    if (textoTipo !== "" && !opcion) errorFila("Tarima o caja", `"${textoTipo}" no está en el catálogo. Copia el nombre exacto de la lista de opciones.`);
    const tipo = opcion ? opcion.nombre : "";
    const medidas = medidasDeCatalogo(opcion);

    const valores = {};
    [["estibable", "Estibable"], ["unica", "Una sola pieza"], ["masEncima", "Mas piezas encima"]].forEach(([clave, nombre]) => {
      if (textoDe(leer(clave)) === "") { valores[clave] = null; return; }
      const v = siNo(leer(clave));
      if (v === undefined) errorFila(nombre, `"${textoDe(leer(clave))}" no es válido. Escribe Sí o No.`);
      valores[clave] = v === undefined ? null : v;
    });

    let estibable = valores.estibable;
    let unica = null;
    let masEncima = null;
    const entraEnRack = medidas !== "" && cabeEnRack(medidas);
    if (entraEnRack) {
      if (estibable === null) errorFila("Estibable", "Es obligatorio para piezas que van a rack: escribe Sí o No.");
      if (estibable === false) {
        unica = valores.unica;
        if (unica === null) errorFila("Una sola pieza", "Es obligatorio cuando la pieza no se puede estibar: escribe Sí o No.");
      }
    } else {
      unica = estibable === false ? valores.unica : null;
      if (medidas !== "") {
        avisos.push({ fila, columna: "Tarima o caja", motivo: `No cabe en un rack (pasa de ${LARGO_NIVEL} × ${ANCHO_NIVEL} pulgadas o de la altura de los niveles). Quedará en ${ZONA_SIN_RACK}.` });
      }
    }
    if (estibable === true) masEncima = valores.masEncima ?? true;

    const textoEquipo = textoDe(leer("equipo"));
    let equipo = "";
    if (textoEquipo !== "") {
      equipo = equiposPorClave.get(sinAcentos(textoEquipo)) || "";
      if (!equipo) errorFila("Equipo", `"${textoEquipo}" no es un equipo válido. Equipos: ${equipos.join(", ")}.`);
    }

    filas.push({
      fila, pieza, estandar, cliente, folio: textoDe(leer("folio")), op: textoDe(leer("op")), material: textoDe(leer("material")),
      cantidad, factura, fechaFactura: fechas.fechaFactura, fechaLiberacion: fechas.fechaLiberacion, medidas, tipo,
      tamano: tamanoDeMedidas(medidas), estibable, unica, masEncima, comentarios: textoDe(leer("comentarios")),
      operador: textoDe(leer("operador")), equipo
    });
  });

  if (!filas.length && !errores.length) error(0, "", "El archivo no tiene filas con datos.");
  return { filas, errores, avisos };
}

// Asigna ubicación a cada fila con las mismas reglas de la página de registro. Devuelve las filas con destino
// y las ubicaciones resultantes (copia; no modifica las recibidas).
export function asignarUbicaciones(filas, pesos, ubicacionesActuales) {
  const ubicaciones = { ...ubicacionesActuales };
  const tocadas = new Set();
  const evaluadas = filas.map((f, orden) => ({ f, orden, prioridad: evaluarPrioridad(f.cliente, f.estandar, pesos).orden }));
  evaluadas.sort((a, b) => a.prioridad - b.prioridad || a.orden - b.orden);

  const destinos = new Map();
  evaluadas.forEach(({ f }) => {
    let destino = ZONA_SIN_RACK;
    let motivo = f.medidas === "" ? "Sin tarima o caja: pendiente de medir." : !cabeEnRack(f.medidas) ? "No cabe en un rack." : "";
    if (!motivo) {
      const m = parsearMedidas(f.medidas);
      const r = recomendarUbicacion({
        cliente: f.cliente, estandar: f.estandar, estibable: f.estibable, unica: f.unica, largo: m.largo, ancho: m.ancho, alto: m.alto
      }, pesos, ubicaciones);
      if (r.ubicacion) {
        const datos = { pieza: f.pieza, largo: m.largo, alto: m.alto, estibable: f.estibable === true, completa: f.masEncima === false };
        ubicaciones[r.ubicacion] = colocarEnCelda(ubicaciones[r.ubicacion], datos, r.colocacion);
        tocadas.add(r.ubicacion);
        destino = r.ubicacion;
      } else {
        motivo = "Sin espacio en racks.";
      }
    }
    destinos.set(f.pieza, { destino, motivo });
  });

  return {
    filas: filas.map(f => ({ ...f, ...destinos.get(f.pieza) })),
    ubicaciones,
    tocadas: [...tocadas]
  };
}

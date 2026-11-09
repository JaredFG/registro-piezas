import { getDoc, getDocs, getDocFromCache, getDocsFromCache } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// Lecturas con respaldo: si Firebase no responde o se agotó el límite diario, se usa lo último guardado en este equipo.
const TIEMPO_MAXIMO_MS = 15000;
const CLAVE_ULTIMA_LECTURA = "ultimaLecturaServidor";
const FALLAS_TEMPORALES = new Set(["resource-exhausted", "unavailable", "deadline-exceeded"]);

export const esFallaTemporal = (error) => FALLAS_TEMPORALES.has(error?.code);
export const esLimiteAgotado = (error) => error?.code === "resource-exhausted";

function fechaUltimaLectura() {
  try {
    const valor = Number(localStorage.getItem(CLAVE_ULTIMA_LECTURA));
    return valor ? new Date(valor).toLocaleString("es-MX") : null;
  } catch {
    return null;
  }
}

function registrarLecturaServidor() {
  try {
    localStorage.setItem(CLAVE_ULTIMA_LECTURA, String(Date.now()));
  } catch {
    // Sin almacenamiento solo se pierde la fecha del aviso.
  }
  document.getElementById("aviso-respaldo")?.remove();
}

function mostrarAvisoRespaldo(error) {
  let aviso = document.getElementById("aviso-respaldo");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "aviso-respaldo";
    aviso.className = "aviso-respaldo";
    aviso.setAttribute("role", "status");
    document.body.prepend(aviso);
  }
  const causa = esLimiteAgotado(error)
    ? "Se agotó el límite diario de consultas de Firebase."
    : "No hay respuesta de Firebase: puede ser el límite diario o la conexión.";
  const fecha = fechaUltimaLectura();
  aviso.textContent = `${causa} Se muestran los últimos datos guardados en este equipo${fecha ? ` (actualizados el ${fecha})` : ""}.`;
}

function conTiempoMaximo(promesa) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(
      () => rechazar(Object.assign(new Error("Sin respuesta de Firebase"), { code: "deadline-exceeded" })),
      TIEMPO_MAXIMO_MS
    ))
  ]);
}

const DOCUMENTO_SIN_DATOS = { sinDatos: true, exists: () => false, data: () => undefined, metadata: { fromCache: true } };

export async function leerDocumento(ref) {
  try {
    const documento = await conTiempoMaximo(getDoc(ref));
    if (documento.metadata.fromCache) mostrarAvisoRespaldo();
    else registrarLecturaServidor();
    return documento;
  } catch (error) {
    mostrarAvisoRespaldo(error);
    try {
      return await getDocFromCache(ref);
    } catch {
      return DOCUMENTO_SIN_DATOS;
    }
  }
}

export async function leerColeccion(consulta) {
  try {
    const resultado = await conTiempoMaximo(getDocs(consulta));
    if (resultado.metadata.fromCache) mostrarAvisoRespaldo();
    else registrarLecturaServidor();
    return resultado;
  } catch (error) {
    mostrarAvisoRespaldo(error);
    try {
      return await getDocsFromCache(consulta);
    } catch {
      return { docs: [], metadata: { fromCache: true } };
    }
  }
}

// Devuelve el perfil, null si Firebase confirma que no existe, o { sinConfirmar: true } si no se pudo saber.
export async function leerPerfil(ref, uid) {
  const clave = `perfil:${uid}`;
  const documento = await leerDocumento(ref);
  if (documento.exists()) {
    const datos = documento.data();
    try {
      localStorage.setItem(clave, JSON.stringify({ nombre: datos.nombre, rol: datos.rol, equipo: datos.equipo }));
    } catch {
      // Sin almacenamiento solo se pierde el respaldo del perfil.
    }
    return datos;
  }
  if (!documento.sinDatos && !documento.metadata.fromCache) return null;
  try {
    return JSON.parse(localStorage.getItem(clave)) || { sinConfirmar: true };
  } catch {
    return { sinConfirmar: true };
  }
}

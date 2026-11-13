// Página de carga: lee un Excel, lo valida y, si no tiene errores, sube las piezas a Firestore
// con la clave de servicio elegida (se lee en el navegador y solo se usa para pedir el token a Google).
import { EQUIPOS } from "./equipos.js";
import { CATALOGO } from "./catalogo.js";
import { validarMatriz, asignarUbicaciones, COLUMNAS, ZONA_SIN_RACK } from "./carga-excel.js";
import { FRECUENCIA_DEFAULT } from "./optimizacion.js";

const el = (id) => document.getElementById(id);
const ALCANCE = "https://www.googleapis.com/auth/datastore";
const MAXIMO_ESCRITURAS = 400;

let clave = null;
let token = null;
let plan = null;
let lote = null;

const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const base64Url = (datos) => btoa(String.fromCharCode(...new Uint8Array(datos))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const codificar = (texto) => base64Url(new TextEncoder().encode(texto));

function mostrarMensaje(texto, tipo) {
  el("mensaje").textContent = texto;
  el("mensaje").className = "mensaje " + (tipo || "");
}

function estado(id, texto, tipo) {
  el(id).textContent = texto;
  el(id).className = "estado-folio " + (tipo || "");
}

// ---- Acceso a Firestore por REST ----
async function obtenerToken() {
  if (token && token.expira > Date.now() + 60000) return token.valor;
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = codificar(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = codificar(JSON.stringify({ iss: clave.client_email, scope: ALCANCE, aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 }));
  const pem = clave.private_key.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const binario = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey("pkcs8", binario, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", llave, new TextEncoder().encode(`${cabecera}.${cuerpo}`));
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cabecera}.${cuerpo}.${base64Url(firma)}` })
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error_description || datos.error || "No se pudo obtener acceso.");
  token = { valor: datos.access_token, expira: Date.now() + datos.expires_in * 1000 };
  return token.valor;
}

const rutaBase = () => `projects/${clave.project_id}/databases/(default)/documents`;

async function llamar(ruta, opciones = {}) {
  const respuesta = await fetch(`https://firestore.googleapis.com/v1/${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${await obtenerToken()}`, "Content-Type": "application/json" }
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error?.message || `Error ${respuesta.status}`);
    error.estado = datos.error?.status || respuesta.status;
    throw error;
  }
  return datos;
}

// ---- Conversión de valores de Firestore ----
function aValor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(aValor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, aValor(x)])) } };
}

function deValor(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, deValor(x)]));
  return null;
}

const camposDe = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined).map(([k, v]) => [k, aValor(v)]));

async function leerDocumento(ruta) {
  try {
    const doc = await llamar(`${rutaBase()}/${ruta}`);
    return { datos: deValor({ mapValue: { fields: doc.fields || {} } }), actualizadoEn: doc.updateTime };
  } catch (error) {
    if (error.estado === "NOT_FOUND" || error.estado === 404) return null;
    throw error;
  }
}

async function existentes(piezas) {
  const encontradas = new Set();
  for (let i = 0; i < piezas.length; i += 200) {
    const lista = piezas.slice(i, i + 200);
    const respuesta = await llamar(`${rutaBase()}:batchGet`, {
      method: "POST",
      body: JSON.stringify({ documents: lista.map(id => `${rutaBase()}/piezas/${id}`), mask: { fieldPaths: ["folio"] } })
    });
    respuesta.forEach(r => { if (r.found) encontradas.add(r.found.name.split("/").pop()); });
  }
  return encontradas;
}

// ---- Lectura del Excel ----
function leerExcel(buffer) {
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "", blankrows: false });
}

function descargarPlantilla() {
  const encabezados = COLUMNAS.map(c => c.nombre);
  const ejemplo = ["FF-000001", "12345", "Cliente de ejemplo", "", "100200", "Alloy 718", 1, 9500000001, "2026-11-01", "TARIMA EUROPALLET-A1 36\"X36\"", "Sí", "", "Sí", "", "", "", ""];
  const hoja = XLSX.utils.aoa_to_sheet([encabezados, ejemplo]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Piezas");
  const catalogo = XLSX.utils.aoa_to_sheet([["Tarima o caja (copia el nombre exacto)", "Largo", "Ancho", "Alto"], ...CATALOGO.map(m => [m.nombre, m.largo, m.ancho, m.alto ?? ""])]);
  XLSX.utils.book_append_sheet(libro, catalogo, "Catalogo");
  XLSX.writeFile(libro, "plantilla-carga-piezas.xlsx");
}

// ---- Pantalla ----
function pintarResultado({ errores, avisos, asignadas }) {
  el("paso-resultado").hidden = false;
  el("btn-subir").disabled = true;
  mostrarMensaje("", "");

  if (errores.length) {
    el("errores").innerHTML = `
      <div class="mensaje error">El archivo no se puede subir: ${errores.length} problema(s). Corrígelos en el Excel y vuelve a elegirlo. No se subió nada.</div>
      <div class="lista-errores"><table>
        <thead><tr><th>Fila</th><th>Columna</th><th>Problema</th></tr></thead>
        <tbody>${errores.slice(0, 500).map(e => `<tr><td>${e.fila || "—"}</td><td>${escapar(e.columna)}</td><td>${escapar(e.motivo)}</td></tr>`).join("")}</tbody>
      </table></div>
      ${errores.length > 500 ? `<p class="ayuda">Se muestran los primeros 500 problemas.</p>` : ""}`;
    el("resumen").innerHTML = "";
    el("vista-previa").innerHTML = "";
    return;
  }

  const enRack = asignadas.filter(f => f.destino !== ZONA_SIN_RACK).length;
  el("errores").innerHTML = avisos.length
    ? `<p class="ayuda">${avisos.length} pieza(s) con medidas fuera de rack: quedarán en ${ZONA_SIN_RACK}.</p>` : "";
  el("resumen").innerHTML = `
    <div><strong>${asignadas.length}</strong>piezas válidas</div>
    <div><strong>${enRack}</strong>en rack</div>
    <div><strong>${asignadas.length - enRack}</strong>en ${ZONA_SIN_RACK}</div>`;
  el("vista-previa").innerHTML = `<table>
    <thead><tr><th>Fila</th><th>Pieza</th><th>Cliente</th><th>Estándar</th><th>Tarima o caja</th><th>Destino</th><th>Nota</th></tr></thead>
    <tbody>${asignadas.slice(0, 300).map(f => `<tr><td>${f.fila}</td><td>${escapar(f.pieza)}</td><td>${escapar(f.cliente)}</td><td>${escapar(f.estandar)}</td><td>${escapar(f.tipo || "—")}</td><td>${escapar(f.destino)}</td><td>${escapar(f.motivo)}</td></tr>`).join("")}</tbody>
  </table>${asignadas.length > 300 ? `<p class="ayuda" style="padding:6px 10px">Vista previa de las primeras 300 filas.</p>` : ""}`;
  el("btn-subir").disabled = false;
}

async function revisarArchivo(archivo) {
  plan = null;
  el("paso-resultado").hidden = true;
  estado("estado-excel", "Leyendo y validando...", "");
  try {
    const matriz = leerExcel(await archivo.arrayBuffer());
    const { filas, errores, avisos } = validarMatriz(matriz, { equipos: EQUIPOS });

    if (!errores.length) {
      estado("estado-excel", "Consultando la base para detectar piezas repetidas...", "");
      const yaExisten = await existentes(filas.map(f => f.pieza));
      filas.filter(f => yaExisten.has(f.pieza)).forEach(f => errores.push({ fila: f.fila, columna: "Pieza", motivo: `La pieza ${f.pieza} ya existe en la base; no se sobrescribe.` }));
    }

    if (errores.length) {
      estado("estado-excel", "El archivo tiene errores.", "");
      pintarResultado({ errores, avisos, asignadas: [] });
      return;
    }

    const [ocupacion, pesos] = await Promise.all([leerDocumento("config/ocupacion"), leerDocumento("config/pesos")]);
    const resultado = asignarUbicaciones(filas, pesos?.datos || { clientes: {}, estandares: {} }, ocupacion?.datos?.ubicaciones || {});
    lote = `carga-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    plan = { ...resultado, ocupacionActualizadaEn: ocupacion?.actualizadoEn || null, ocupacionExiste: Boolean(ocupacion) };
    estado("estado-excel", `Archivo correcto: ${filas.length} piezas.`, "encontrado");
    pintarResultado({ errores: [], avisos, asignadas: resultado.filas });
  } catch (error) {
    console.error(error);
    estado("estado-excel", `No se pudo revisar el archivo: ${error.message}`, "");
  }
}

function construirEscrituras(piezas) {
  const ahora = new Date();
  const nombre = (ruta) => `${rutaBase()}/${ruta}`;
  return piezas.flatMap(f => {
    const comunes = {
      folio: f.pieza, op: f.op, cliente: f.cliente, material: f.material, cantidad: f.cantidad, piezas: f.folio,
      fechaFactura: f.fechaFactura, factura: f.factura, medidas: f.medidas, tipo: f.tipo, equipo: f.equipo, cargaOrigen: lote
    };
    const operador = f.operador || "Carga masiva";
    return [
      {
        update: {
          name: nombre(`piezas/${f.pieza}`),
          fields: camposDe({
            ...comunes, estandar: f.estandar, tamano: f.tamano, estibable: f.estibable, unica: f.unica, masEncima: f.masEncima,
            ultimaZona: f.destino, ...(f.fechaLiberacion ? { fechaLiberacion: f.fechaLiberacion } : {}),
            actualizadoPor: operador, actualizadoEn: ahora, primerRegistro: ahora
          })
        }
      },
      {
        update: {
          name: nombre(`registros/${lote}-${f.pieza}`),
          fields: camposDe({
            ...comunes, estandarPieza: f.estandar, estibable: f.estibable, unica: f.unica, masEncima: f.masEncima,
            zonaOrigen: ZONA_SIN_RACK, zonaDestino: f.destino, comentarios: f.comentarios, estado: "",
            nombreOperador: operador, uidOperador: null, creadoEn: ahora
          })
        }
      }
    ];
  });
}

async function subir() {
  if (!plan) return;
  el("btn-subir").disabled = true;
  el("archivo-excel").disabled = true;
  const piezas = plan.filas;
  const escrituras = construirEscrituras(piezas);
  const lotes = [];
  for (let i = 0; i < escrituras.length; i += MAXIMO_ESCRITURAS) lotes.push(escrituras.slice(i, i + MAXIMO_ESCRITURAS));

  const nombreOcupacion = `${rutaBase()}/config/ocupacion`;
  const celdas = plan.tocadas.map(id => `\`${id}\``);
  const escrituraOcupacion = plan.tocadas.length ? [{
    update: { name: nombreOcupacion, fields: { ubicaciones: aValor(Object.fromEntries(plan.tocadas.map(id => [id, plan.ubicaciones[id]]))) } },
    updateMask: { fieldPaths: celdas.map(c => `ubicaciones.${c}`) },
    currentDocument: plan.ocupacionExiste ? { updateTime: plan.ocupacionActualizadaEn } : { exists: false }
  }] : [];

  try {
    // La ocupación va en el primer envío: si otro operador la cambió mientras tanto, no se escribe nada.
    for (let i = 0; i < lotes.length; i++) {
      mostrarMensaje(`Subiendo ${i + 1} de ${lotes.length}...`, "");
      await llamar(`${rutaBase()}:commit`, { method: "POST", body: JSON.stringify({ writes: [...(i === 0 ? escrituraOcupacion : []), ...lotes[i]] }) });
    }
    if (!plan.ocupacionExiste) {
      await llamar(`${rutaBase()}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [{ update: { name: `${rutaBase()}/config/ajustes`, fields: camposDe({ frecuencia: FRECUENCIA_DEFAULT }) }, updateMask: { fieldPaths: ["frecuencia"] } }] })
      });
    }
    mostrarMensaje(`Listo: se subieron ${piezas.length} piezas (${plan.tocadas.length} ubicaciones de rack actualizadas).`, "ok");
    plan = null;
    el("archivo-excel").value = "";
  } catch (error) {
    console.error(error);
    const conflicto = error.estado === "FAILED_PRECONDITION" || error.estado === "ABORTED";
    mostrarMensaje(conflicto
      ? "Otro usuario cambió la ocupación de los racks mientras se preparaba la carga. No se subió nada: vuelve a elegir el archivo."
      : `No se pudo subir: ${error.message}. Revisa la conexión y vuelve a elegir el archivo; las piezas ya subidas se detectarán como repetidas.`, "error");
  } finally {
    el("archivo-excel").disabled = false;
  }
}

el("archivo-clave").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  clave = null;
  token = null;
  el("archivo-excel").disabled = true;
  if (!archivo) return;
  try {
    const datos = JSON.parse(await archivo.text());
    if (datos.type !== "service_account" || !datos.private_key || !datos.client_email || !datos.project_id) throw new Error("no es una clave de servicio de Firebase");
    clave = datos;
    await obtenerToken();
    estado("estado-clave", `Conectado al proyecto ${clave.project_id}.`, "encontrado");
    el("archivo-excel").disabled = false;
  } catch (error) {
    clave = null;
    estado("estado-clave", `No se pudo usar la clave: ${error.message}`, "");
  }
});

el("archivo-excel").addEventListener("change", (e) => {
  if (e.target.files[0]) revisarArchivo(e.target.files[0]);
});
el("btn-plantilla").addEventListener("click", descargarPlantilla);
el("btn-subir").addEventListener("click", subir);

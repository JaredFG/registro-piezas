import { collection, doc, setDoc, runTransaction, deleteField, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { leerDocumento, leerColeccion, esFallaTemporal } from "./lecturas.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { separarMedidas, unirMedidas } from "./medidas.js";
import { ZONA_RACK, ZONAS_ORIGEN, ZONAS_DESTINO, llenarSelectZonas } from "./zonas.js";
import {
  RACKS, POSICIONES, NIVELES, FRECUENCIA_DEFAULT, idUbicacion, parsearUbicacion, nivelesPermitidos,
  tamanoDeMedidas, periodoDe, calcularPesos, recomendarUbicacion
} from "./optimizacion.js";

llenarSelectZonas("zona-origen", ZONAS_ORIGEN);
llenarSelectZonas("zona-destino", ZONAS_DESTINO);

function actualizarRelojFecha() {
  document.getElementById("fecha-hora").value = new Date().toLocaleString("es-MX");
}
actualizarRelojFecha();
setInterval(actualizarRelojFecha, 1000);

const form = document.getElementById("form-registro");
const mensaje = document.getElementById("mensaje");
const campoFolio = document.getElementById("folio");
const estadoFolio = document.getElementById("estado-folio");

const campo = (id) => document.getElementById(id);
const ID_MEDIDAS = ["medida-largo", "medida-ancho", "medida-alto"];
const refOcupacion = doc(db, "config", "ocupacion");
const refPesos = doc(db, "config", "pesos");
const refAjustes = doc(db, "config", "ajustes");

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
}

function mostrarEstadoFolio(texto, tipo) {
  estadoFolio.textContent = texto;
  estadoFolio.className = "estado-folio " + (tipo || "");
}

// El folio es el ID del documento en "piezas": se normaliza para que "a12" y " A12 " sean la misma pieza.
function normalizarFolio(valor) {
  return valor.trim().toUpperCase();
}

// Firestore no acepta "/" en el ID de un documento, ni los IDs "." o "..".
function folioValido(folio) {
  return folio !== "" && !folio.includes("/") && folio !== "." && folio !== "..";
}

function llenarOpciones(select, valores, textoVacio) {
  select.innerHTML = "";
  select.add(new Option(textoVacio, ""));
  valores.forEach(v => select.add(new Option(v.texto, v.valor)));
}

const OPCIONES_RACK = RACKS.map(r => ({ texto: r, valor: r }));
const OPCIONES_POSICION = Array.from({ length: POSICIONES }, (_, i) => ({ texto: i + 1, valor: i + 1 }));
llenarOpciones(campo("rack-letra"), OPCIONES_RACK, "Elige...");
llenarOpciones(campo("rack-posicion"), OPCIONES_POSICION, "Elige...");
llenarOpciones(campo("origen-letra"), OPCIONES_RACK, "Elige...");
llenarOpciones(campo("origen-posicion"), OPCIONES_POSICION, "Elige...");
llenarOpciones(campo("origen-nivel"), NIVELES.map(n => ({ texto: `N${n}`, valor: n })), "Elige...");

function medidasCapturadas() {
  return unirMedidas(ID_MEDIDAS.map(id => campo(id).value));
}

function tamanoActual() {
  const medidas = medidasCapturadas();
  return medidas ? tamanoDeMedidas(medidas) : null;
}

function actualizarNiveles() {
  const tamano = tamanoActual();
  const select = campo("rack-nivel");
  const anterior = select.value;
  const niveles = nivelesPermitidos(tamano);
  llenarOpciones(select, niveles.map(n => ({ texto: `N${n}`, valor: n })), "Elige...");
  if (niveles.includes(Number(anterior)) && anterior !== "") select.value = anterior;

  const medidas = medidasCapturadas();
  const aviso = campo("tamano-pieza");
  if (medidas === "") aviso.textContent = "Sin medidas: pendiente de medir.";
  else if (medidas === null) aviso.textContent = "Completa las tres medidas con valores mayores a cero.";
  else aviso.textContent = tamano === "chica" ? "Pieza chica: niveles N0 a N3." : "Pieza grande: niveles N4 y N5.";
}

function ponerUbicacion(ubicacion) {
  const u = parsearUbicacion(ubicacion);
  campo("rack-letra").value = u ? u.rack : "";
  campo("rack-posicion").value = u ? u.posicion : "";
  campo("rack-nivel").value = u ? u.nivel : "";
}

function ubicacionElegida() {
  const rack = campo("rack-letra").value;
  const posicion = campo("rack-posicion").value;
  const nivel = campo("rack-nivel").value;
  return rack && posicion && nivel !== "" ? idUbicacion(rack, posicion, nivel) : "";
}

// Si el operador cambia el rack a mano, la recomendación ya no sobrescribe su elección.
let ubicacionManual = false;
let consultaRecomendacion = 0;
const TEXTO_FALTAN_DATOS = "Captura el cliente, el estándar y las tres medidas para recibir una recomendación de rack.";

function mostrarRecomendacion(texto, ubicacion) {
  const caja = campo("recomendacion");
  caja.textContent = texto;
  if (!ubicacion) return;
  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = "Usar recomendación";
  boton.addEventListener("click", () => {
    ponerUbicacion(ubicacion);
    ubicacionManual = false;
  });
  caja.appendChild(boton);
}

// Movimientos capturados mientras Firebase no acepta escrituras; se envían solos cuando vuelve.
const claveCola = (usuario) => `colaRegistros:${usuario.uid}`;

function leerCola(usuario) {
  try {
    return JSON.parse(localStorage.getItem(claveCola(usuario))) || [];
  } catch {
    return [];
  }
}

function guardarCola(usuario, cola) {
  localStorage.setItem(claveCola(usuario), JSON.stringify(cola));
  campo("cola-pendiente").textContent = cola.length
    ? `${cola.length} registro(s) guardados en este equipo, pendientes de enviar a Firebase. No cierres sesión ni borres los datos del navegador.`
    : "";
}

function ocupadasEnCola(usuario) {
  return Object.fromEntries(leerCola(usuario).filter(m => parsearUbicacion(m.zonaDestino)).map(m => [m.zonaDestino, m.folio]));
}

// La ocupación, el movimiento y la ficha se guardan juntos, y dos operadores no pueden tomar el mismo lugar.
function guardarMovimiento(m, usuario) {
  const refFicha = doc(db, "piezas", m.folio);
  const cuando = m.capturadoEn ? Timestamp.fromMillis(m.capturadoEn) : serverTimestamp();
  return runTransaction(db, async (tx) => {
    const ficha = await tx.get(refFicha);
    const ocupacion = await tx.get(refOcupacion);
    const ubicaciones = ocupacion.data()?.ubicaciones || {};
    const anterior = ficha.data()?.ultimaZona;
    const esRack = Boolean(parsearUbicacion(m.zonaDestino));

    if (esRack && ubicaciones[m.zonaDestino] && ubicaciones[m.zonaDestino] !== m.folio) {
      const error = new Error("ubicacion-ocupada");
      error.ocupadaPor = ubicaciones[m.zonaDestino];
      throw error;
    }

    const cambios = {};
    if (parsearUbicacion(anterior) && anterior !== m.zonaDestino && ubicaciones[anterior] === m.folio) {
      cambios[anterior] = deleteField();
    }
    if (esRack) cambios[m.zonaDestino] = m.folio;
    if (Object.keys(cambios).length) tx.set(refOcupacion, { ubicaciones: cambios }, { merge: true });

    tx.set(doc(db, "registros", m.id), {
      folio: m.folio,
      op: m.pieza.op,
      estandarPieza: m.pieza.estandar,
      cliente: m.pieza.cliente,
      material: m.pieza.material,
      cantidad: m.pieza.cantidad,
      piezas: m.pieza.piezas,
      fechaFactura: m.pieza.fechaFactura,
      factura: m.pieza.factura,
      medidas: m.pieza.medidas,
      equipo: usuario.equipo,
      zonaOrigen: m.zonaOrigen,
      zonaDestino: m.zonaDestino,
      comentarios: m.comentarios,
      estado: m.estado,
      nombreOperador: usuario.nombre,
      uidOperador: usuario.uid,
      creadoEn: cuando
    });

    tx.set(refFicha, {
      folio: m.folio,
      ...m.pieza,
      equipo: usuario.equipo,
      ultimaZona: m.zonaDestino,
      actualizadoPor: usuario.nombre,
      actualizadoEn: cuando,
      ...(ficha.exists() ? {} : { primerRegistro: cuando })
    }, { merge: true });
  });
}

let enviandoCola = false;

async function enviarCola(usuario) {
  if (enviandoCola) return;
  enviandoCola = true;
  try {
    for (const movimiento of leerCola(usuario)) {
      try {
        await guardarMovimiento(movimiento, usuario);
      } catch (error) {
        if (error.message !== "ubicacion-ocupada") {
          if (!esFallaTemporal(error)) console.error("No se pudo enviar el registro pendiente:", error);
          break;
        }
        mostrarMensaje(`El registro pendiente del folio ${movimiento.folio} no se guardó: ${movimiento.zonaDestino} ya la ocupó el folio ${error.ocupadaPor}. Captúralo de nuevo.`, "error");
      }
      guardarCola(usuario, leerCola(usuario).filter(m => m.id !== movimiento.id));
    }
  } finally {
    enviandoCola = false;
    guardarCola(usuario, leerCola(usuario));
  }
}

function iniciarRecomendaciones(usuario) {
  let pesosVigentes = null;
  let frecuencia = null;
  let recalculoPospuesto = false;

  // El primer operador que lo necesita en un periodo nuevo recalcula los pesos; los demás ya los encuentran al día.
  async function obtenerPesos() {
    if (pesosVigentes && (recalculoPospuesto || pesosVigentes.periodo === periodoDe(frecuencia))) return pesosVigentes;

    const [ajustes, actuales] = await Promise.all([leerDocumento(refAjustes), leerDocumento(refPesos)]);
    frecuencia = ajustes.data()?.frecuencia || FRECUENCIA_DEFAULT;
    const periodo = periodoDe(frecuencia);
    if (actuales.exists() && actuales.data().periodo === periodo) {
      pesosVigentes = actuales.data();
      return pesosVigentes;
    }

    try {
      const piezas = await leerColeccion(collection(db, "piezas"));
      // Con datos parciales del equipo no se recalcula: se siguen usando los últimos pesos.
      if (piezas.metadata.fromCache) throw new Error("Sin datos completos para recalcular");
      const pesos = calcularPesos(piezas.docs.map(d => {
        const p = d.data();
        return { cliente: p.cliente, estandar: p.estandar ?? p.nombre, fecha: (p.primerRegistro ?? p.actualizadoEn)?.toDate() ?? null };
      }));
      const nuevos = { ...pesos, periodo, frecuencia };
      await setDoc(refPesos, { ...nuevos, calculadoEn: serverTimestamp(), calculadoPor: usuario.nombre });
      pesosVigentes = nuevos;
    } catch (error) {
      console.warn("No se pudieron recalcular los pesos:", error);
      recalculoPospuesto = true;
      pesosVigentes = actuales.data() || { clientes: {}, estandares: {}, periodo: null };
    }
    return pesosVigentes;
  }

  return async function actualizarRecomendacion() {
    actualizarNiveles();
    const cliente = campo("cliente").value.trim();
    const estandar = campo("estandar-pieza").value.trim();
    if (!cliente || !estandar || !tamanoActual()) {
      consultaRecomendacion++;
      mostrarRecomendacion(TEXTO_FALTAN_DATOS);
      if (!ubicacionManual) ponerUbicacion("");
      return;
    }

    const consulta = ++consultaRecomendacion;
    mostrarRecomendacion("Buscando la mejor ubicación...");
    try {
      const [pesos, ocupacion] = await Promise.all([obtenerPesos(), leerDocumento(refOcupacion)]);
      if (consulta !== consultaRecomendacion) return;

      const ocupadas = { ...(ocupacion.data()?.ubicaciones || {}), ...ocupadasEnCola(usuario) };
      const r = recomendarUbicacion({ cliente, estandar, tamano: tamanoActual() }, pesos, ocupadas);
      if (!r.ubicacion) {
        mostrarRecomendacion("No hay ubicaciones libres para este tamaño de pieza.");
        if (!ubicacionManual) ponerUbicacion("");
        return;
      }
      mostrarRecomendacion(`Recomendado: ${r.ubicacion} (cliente ${r.prioridadCliente}, estándar ${r.prioridadEstandar}). `, r.ubicacion);
      if (!ubicacionManual) ponerUbicacion(r.ubicacion);
    } catch (error) {
      console.error("No se pudo obtener la recomendación:", error);
      if (consulta === consultaRecomendacion) {
        mostrarRecomendacion("No se pudo obtener la recomendación. Puedes elegir el rack a mano.");
      }
    }
  };
}

// La ubicación actual de una pieza puede no estar en la lista, como un rack o una zona anterior.
function ponerOrigen(ultimaZona) {
  const select = campo("zona-origen");
  [...select.options].filter(o => o.dataset.temporal).forEach(o => o.remove());
  select.disabled = false;
  if (!ultimaZona) {
    select.selectedIndex = 0;
    return;
  }
  if (!ZONAS_ORIGEN.includes(ultimaZona)) {
    const opcion = new Option(ultimaZona, ultimaZona);
    opcion.dataset.temporal = "1";
    select.add(opcion);
  }
  select.value = ultimaZona;
  select.disabled = Boolean(parsearUbicacion(ultimaZona));
}

function zonaOrigenElegida() {
  const zona = campo("zona-origen").value;
  if (zona !== ZONA_RACK) return zona;
  const rack = campo("origen-letra").value;
  const posicion = campo("origen-posicion").value;
  const nivel = campo("origen-nivel").value;
  return rack && posicion && nivel !== "" ? idUbicacion(rack, posicion, nivel) : "";
}

function llenarDatosPieza(pieza) {
  campo("op").value = pieza.op || "";
  campo("estandar-pieza").value = pieza.estandar ?? pieza.nombre ?? "";
  campo("cliente").value = pieza.cliente || "";
  campo("material").value = pieza.material || "";
  campo("cantidad").value = pieza.cantidad ?? "";
  campo("piezas").value = pieza.piezas ?? "";
  campo("fecha-factura").value = pieza.fechaFactura || "";
  campo("factura").value = pieza.factura ?? "";
  separarMedidas(pieza.medidas).forEach((valor, i) => { campo(ID_MEDIDAS[i]).value = valor; });
  ponerOrigen(pieza.ultimaZona);
}

function limpiarDatosPieza() {
  ["op", "estandar-pieza", "cliente", "material", "cantidad", "piezas", "fecha-factura", "factura", ...ID_MEDIDAS].forEach(id => { campo(id).value = ""; });
  ponerOrigen("");
}

function mostrarBloqueRack() {
  campo("bloque-rack").hidden = campo("zona-destino").value !== ZONA_RACK;
  campo("bloque-origen-rack").hidden = campo("zona-origen").value !== ZONA_RACK;
}

protegerPagina("operador").then((usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");

  const actualizarRecomendacion = iniciarRecomendaciones(usuario);

  enviarCola(usuario);
  setInterval(() => enviarCola(usuario), 5 * 60 * 1000);
  window.addEventListener("online", () => enviarCola(usuario));

  // Evita que los datos del folio anterior se queden en el formulario si el nuevo folio no existe.
  let datosAutollenados = false;

  async function buscarFolio() {
    const folio = normalizarFolio(campoFolio.value);
    campoFolio.value = folio;

    if (folio === "") {
      mostrarEstadoFolio("", "");
      return;
    }
    if (!folioValido(folio)) {
      mostrarEstadoFolio("El folio no puede llevar el carácter \"/\".", "");
      return;
    }

    mostrarEstadoFolio("Buscando folio...", "");
    try {
      const ficha = await leerDocumento(doc(db, "piezas", folio));
      if (campoFolio.value !== folio) return;

      if (ficha.exists()) {
        llenarDatosPieza(ficha.data());
        mostrarBloqueRack();
        datosAutollenados = true;
        mostrarEstadoFolio("Pieza encontrada: se cargaron sus datos. Puedes corregirlos si algo cambió.", "encontrado");
      } else {
        if (datosAutollenados) limpiarDatosPieza();
        mostrarBloqueRack();
        datosAutollenados = false;
        mostrarEstadoFolio("Folio nuevo: se creará la ficha de la pieza al registrar.", "nuevo");
      }
      actualizarRecomendacion();
    } catch (error) {
      mostrarEstadoFolio("No se pudo consultar el folio. Llena los datos a mano.", "");
    }
  }

  campoFolio.addEventListener("change", buscarFolio);
  ["cliente", "estandar-pieza", ...ID_MEDIDAS].forEach(id => campo(id).addEventListener("change", actualizarRecomendacion));
  ["rack-letra", "rack-posicion", "rack-nivel"].forEach(id => campo(id).addEventListener("change", () => { ubicacionManual = true; }));
  campo("zona-destino").addEventListener("change", mostrarBloqueRack);
  campo("zona-origen").addEventListener("change", mostrarBloqueRack);
  actualizarNiveles();
  mostrarBloqueRack();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarMensaje("", "");

    if (usuario.sinPerfil) {
      mostrarMensaje("No se pudo confirmar tu perfil y equipo por ahora. Recarga la página más tarde para registrar.", "error");
      return;
    }

    const folio = normalizarFolio(campoFolio.value);
    if (!folioValido(folio)) {
      mostrarMensaje("El folio no puede llevar el carácter \"/\".", "error");
      return;
    }

    const medidas = medidasCapturadas();
    if (medidas === null) {
      mostrarMensaje("Completa las tres medidas con valores mayores a cero, o déjalas vacías.", "error");
      return;
    }

    const zonaOrigen = zonaOrigenElegida();
    if (!zonaOrigen) {
      mostrarMensaje("Elige el rack, la posición y el nivel de origen.", "error");
      return;
    }

    const esRack = campo("zona-destino").value === ZONA_RACK;
    const zonaDestino = esRack ? ubicacionElegida() : campo("zona-destino").value;
    if (esRack && !zonaDestino) {
      mostrarMensaje("Elige el rack, la posición y el nivel.", "error");
      return;
    }

    const textoCantidad = campo("cantidad").value;
    const textoFactura = campo("factura").value;
    const pieza = {
      op: campo("op").value.trim(),
      estandar: campo("estandar-pieza").value.trim(),
      cliente: campo("cliente").value.trim(),
      material: campo("material").value.trim(),
      cantidad: textoCantidad === "" ? null : Number(textoCantidad),
      piezas: campo("piezas").value.trim(),
      fechaFactura: campo("fecha-factura").value,
      factura: textoFactura === "" ? null : Number(textoFactura),
      medidas,
      tamano: tamanoDeMedidas(medidas)
    };
    const movimiento = {
      id: doc(collection(db, "registros")).id,
      folio,
      pieza,
      zonaOrigen,
      zonaDestino,
      comentarios: campo("comentarios").value.trim(),
      estado: campo("estado").value.trim(),
      capturadoEn: Date.now()
    };

    const ocupadaEnCola = ocupadasEnCola(usuario)[zonaDestino];
    if (ocupadaEnCola && ocupadaEnCola !== folio) {
      mostrarMensaje(`La ubicación ${zonaDestino} está reservada por el registro pendiente del folio ${ocupadaEnCola}. Elige otra.`, "error");
      return;
    }

    const limpiarFormulario = () => {
      form.reset();
      ponerOrigen("");
      datosAutollenados = false;
      ubicacionManual = false;
      mostrarEstadoFolio("", "");
      actualizarRelojFecha();
      mostrarBloqueRack();
      actualizarRecomendacion();
    };

    try {
      await guardarMovimiento({ ...movimiento, capturadoEn: null }, usuario);
      mostrarMensaje(`Registro del folio ${folio} guardado en ${zonaDestino}.`, "ok");
      limpiarFormulario();
    } catch (error) {
      if (esFallaTemporal(error)) {
        guardarCola(usuario, [...leerCola(usuario), movimiento]);
        mostrarMensaje(`Firebase no aceptó el registro por ahora. El folio ${folio} quedó guardado en este equipo y se enviará solo.`, "ok");
        limpiarFormulario();
        return;
      }
      if (error.message === "ubicacion-ocupada") {
        mostrarMensaje(`La ubicación ${zonaDestino} ya está ocupada por el folio ${error.ocupadaPor}. Elige otra.`, "error");
        ubicacionManual = false;
        actualizarRecomendacion();
        return;
      }
      console.error("Error al guardar el registro:", error);
      const detalle = error && error.code ? ` (${error.code})` : "";
      mostrarMensaje("No se pudo guardar el registro. Intenta de nuevo." + detalle, "error");
    }
  });
});

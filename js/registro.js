import { collection, doc, getDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { normalizarMedidas } from "./medidas.js";
import { ZONAS_ORIGEN, ZONAS_DESTINO, llenarSelectZonas } from "./zonas.js";

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

function llenarDatosPieza(pieza) {
  campo("op").value = pieza.op || "";
  campo("estandar-pieza").value = pieza.estandar ?? pieza.nombre ?? "";
  campo("cliente").value = pieza.cliente || "";
  campo("material").value = pieza.material || "";
  campo("cantidad").value = pieza.cantidad ?? "";
  campo("factura").value = pieza.factura ?? "";
  campo("medidas").value = pieza.medidas || "";
  if (pieza.ultimaZona && ZONAS_ORIGEN.includes(pieza.ultimaZona)) {
    campo("zona-origen").value = pieza.ultimaZona;
  }
}

function limpiarDatosPieza() {
  ["op", "estandar-pieza", "cliente", "material", "cantidad", "factura", "medidas"].forEach(id => { campo(id).value = ""; });
  campo("zona-origen").selectedIndex = 0;
}

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
    const ficha = await getDoc(doc(db, "piezas", folio));
    if (campoFolio.value !== folio) return;

    if (ficha.exists()) {
      llenarDatosPieza(ficha.data());
      datosAutollenados = true;
      mostrarEstadoFolio("Pieza encontrada: se cargaron sus datos. Puedes corregirlos si algo cambió.", "encontrado");
    } else {
      if (datosAutollenados) limpiarDatosPieza();
      datosAutollenados = false;
      mostrarEstadoFolio("Folio nuevo: se creará la ficha de la pieza al registrar.", "nuevo");
    }
  } catch (error) {
    mostrarEstadoFolio("No se pudo consultar el folio. Llena los datos a mano.", "");
  }
}

campoFolio.addEventListener("change", buscarFolio);

protegerPagina("operador").then((usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarMensaje("", "");

    const folio = normalizarFolio(campoFolio.value);
    if (!folioValido(folio)) {
      mostrarMensaje("El folio no puede llevar el carácter \"/\".", "error");
      return;
    }

    const textoCantidad = campo("cantidad").value;
    const textoFactura = campo("factura").value;
    const medidas = normalizarMedidas(campo("medidas").value);

    const pieza = {
      op: campo("op").value.trim(),
      estandar: campo("estandar-pieza").value.trim(),
      cliente: campo("cliente").value.trim(),
      material: campo("material").value.trim(),
      cantidad: textoCantidad === "" ? null : Number(textoCantidad),
      factura: textoFactura === "" ? null : Number(textoFactura),
      medidas
    };
    const zonaOrigen = campo("zona-origen").value;
    const zonaDestino = campo("zona-destino").value;

    // El movimiento y la ficha se guardan juntos: o se guardan los dos, o ninguno.
    const lote = writeBatch(db);

    lote.set(doc(collection(db, "registros")), {
      folio,
      op: pieza.op,
      estandarPieza: pieza.estandar,
      cliente: pieza.cliente,
      material: pieza.material,
      cantidad: pieza.cantidad,
      factura: pieza.factura,
      medidas: pieza.medidas,
      equipo: usuario.equipo,
      zonaOrigen,
      zonaDestino,
      comentarios: campo("comentarios").value.trim(),
      nombreOperador: usuario.nombre,
      uidOperador: usuario.uid,
      creadoEn: serverTimestamp()
    });

    lote.set(doc(db, "piezas", folio), {
      folio,
      ...pieza,
      equipo: usuario.equipo,
      ultimaZona: zonaDestino,
      actualizadoPor: usuario.nombre,
      actualizadoEn: serverTimestamp()
    }, { merge: true });

    try {
      await lote.commit();
      mostrarMensaje(`Registro del folio ${folio} guardado correctamente.`, "ok");
      form.reset();
      datosAutollenados = false;
      mostrarEstadoFolio("", "");
      actualizarRelojFecha();
    } catch (error) {
      mostrarMensaje("No se pudo guardar el registro. Intenta de nuevo.", "error");
    }
  });
});

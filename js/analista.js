import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { leerDocumento, esLimiteAgotado } from "./lecturas.js";
import { db } from "./firebase-init.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { iniciarDashboard } from "./dashboard-comun.js";

const campo = (id) => document.getElementById(id);
const campoFolio = campo("folio");
const campoFecha = campo("fecha-liberacion");
const botonGuardar = campo("btn-guardar");
const estadoFolio = campo("estado-folio");
const mensaje = campo("mensaje");

const CAMPOS_FICHA = ["op", "estandar-pieza", "cliente", "material", "cantidad", "piezas", "fecha-factura", "factura", "medidas", "equipo", "ultima-zona"];

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
}

function mostrarEstadoFolio(texto, tipo) {
  estadoFolio.textContent = texto;
  estadoFolio.className = "estado-folio " + (tipo || "");
}

function normalizarFolio(valor) {
  return valor.trim().toUpperCase();
}

function limpiarFicha() {
  CAMPOS_FICHA.forEach(id => { campo(id).value = ""; });
  campoFecha.value = "";
  campoFecha.disabled = true;
  botonGuardar.disabled = true;
}

function llenarFicha(p) {
  campo("op").value = p.op || "";
  campo("estandar-pieza").value = p.estandar ?? p.nombre ?? "";
  campo("cliente").value = p.cliente || "";
  campo("material").value = p.material || "";
  campo("cantidad").value = p.cantidad ?? "";
  campo("piezas").value = p.piezas ?? "";
  campo("fecha-factura").value = p.fechaFactura || "";
  campo("factura").value = p.factura ?? "";
  campo("medidas").value = p.medidas || "";
  campo("equipo").value = p.equipo || "";
  campo("ultima-zona").value = p.ultimaZona || "";
  campoFecha.value = p.fechaLiberacion || "";
  campoFecha.disabled = false;
  botonGuardar.disabled = false;
}

protegerPagina("analista").then((usuario) => {
  campo("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");
  const dashboard = iniciarDashboard("dashboard-raiz");

  // Folio con el que se está trabajando; si el campo cambia mientras se consulta, se ignora la respuesta vieja.
  let folioActual = "";

  async function buscarFolio() {
    const folio = normalizarFolio(campoFolio.value);
    campoFolio.value = folio;
    folioActual = "";
    limpiarFicha();
    mostrarMensaje("", "");

    if (folio === "") {
      mostrarEstadoFolio("", "");
      return;
    }
    if (folio.includes("/") || folio === "." || folio === "..") {
      mostrarEstadoFolio("El folio no puede llevar el carácter \"/\".", "");
      return;
    }

    mostrarEstadoFolio("Buscando folio...", "");
    try {
      const ficha = await leerDocumento(doc(db, "piezas", folio));
      if (campoFolio.value !== folio) return;

      if (!ficha.exists()) {
        mostrarEstadoFolio("Ese folio todavía no ha sido registrado por un operador.", "");
        return;
      }
      folioActual = folio;
      llenarFicha(ficha.data());
      mostrarEstadoFolio("Pieza encontrada. Los datos son de solo lectura; puedes poner o actualizar la fecha de liberación.", "encontrado");
    } catch (error) {
      mostrarEstadoFolio("No se pudo consultar el folio.", "");
    }
  }

  campoFolio.addEventListener("change", buscarFolio);

  botonGuardar.addEventListener("click", async () => {
    if (folioActual === "") return;
    if (campoFecha.value === "") {
      mostrarMensaje("Elige la fecha de liberación.", "error");
      return;
    }
    botonGuardar.disabled = true;
    try {
      await updateDoc(doc(db, "piezas", folioActual), {
        fechaLiberacion: campoFecha.value,
        liberadoPor: usuario.nombre,
        liberadoEn: serverTimestamp()
      });
      mostrarMensaje(`Fecha de liberación del folio ${folioActual} guardada.`, "ok");
      dashboard.recargar();
    } catch (error) {
      mostrarMensaje(esLimiteAgotado(error)
        ? "Se agotó el límite diario de Firebase. La fecha no se guardó: inténtalo después del restablecimiento."
        : "No se pudo guardar la fecha. Intenta de nuevo.", "error");
    }
    botonGuardar.disabled = false;
  });
});

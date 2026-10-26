import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
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

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
}

protegerPagina("trabajador").then((usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarMensaje("", "");

    const datos = {
      nombrePieza: document.getElementById("nombre-pieza").value.trim(),
      folio: document.getElementById("folio").value.trim(),
      zonaOrigen: document.getElementById("zona-origen").value,
      zonaDestino: document.getElementById("zona-destino").value,
      comentarios: document.getElementById("comentarios").value.trim(),
      nombreTrabajador: usuario.nombre,
      uidTrabajador: usuario.uid,
      creadoEn: serverTimestamp()
    };

    try {
      await addDoc(collection(db, "registros"), datos);
      mostrarMensaje("Registro guardado correctamente.", "ok");
      form.reset();
      actualizarRelojFecha();
    } catch (error) {
      mostrarMensaje("No se pudo guardar el registro. Intenta de nuevo.", "error");
    }
  });
});

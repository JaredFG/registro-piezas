import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function llenarSelect(id, opciones) {
  const select = document.getElementById(id);
  select.innerHTML = opciones.map(o => `<option value="${o.valor}">${o.texto}</option>`).join("");
}

// Origen: Externo + Zona A..Z. Destino: solo Zona A..Z (sin Externo).
llenarSelect("zona-origen", [
  { valor: "Externo", texto: "Externo" },
  ...ALFABETO.map(letra => ({ valor: `Zona ${letra}`, texto: `Zona ${letra}` }))
]);
llenarSelect("zona-destino", ALFABETO.map(letra => ({ valor: `Zona ${letra}`, texto: `Zona ${letra}` })));

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

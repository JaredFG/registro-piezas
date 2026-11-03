import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";
import { normalizarRol, PAGINA_POR_ROL } from "./roles.js";

const form = document.getElementById("form-login");
const mensaje = document.getElementById("mensaje");
const correoInput = document.getElementById("correo");
const recordarCheckbox = document.getElementById("recordar");

// Recuperar el correo guardado si el usuario marcó "Recuérdame".
const correoGuardado = localStorage.getItem("correoGuardado");
if (correoGuardado) {
  correoInput.value = correoGuardado;
  recordarCheckbox.checked = true;
}

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  mostrarMensaje("", "");
  const correo = document.getElementById("correo").value.trim();
  const contrasena = document.getElementById("contrasena").value;

  try {
    if (recordarCheckbox.checked) {
      localStorage.setItem("correoGuardado", correo);
    } else {
      localStorage.removeItem("correoGuardado");
    }

    const credencial = await signInWithEmailAndPassword(auth, correo, contrasena);
    const uid = credencial.user.uid;

    const usuarioDoc = await getDoc(doc(db, "usuarios", uid));
    if (!usuarioDoc.exists()) {
      mostrarMensaje("Tu cuenta no tiene un perfil asignado. Contacta al administrador.", "error");
      return;
    }

    const destino = PAGINA_POR_ROL[normalizarRol(usuarioDoc.data().rol)];
    if (destino) {
      window.location.href = destino;
    } else {
      mostrarMensaje("Rol no reconocido. Contacta al administrador.", "error");
    }
  } catch (error) {
    mostrarMensaje("Correo o contraseña incorrectos.", "error");
  }
});

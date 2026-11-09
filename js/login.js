import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { doc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";
import { normalizarRol, PAGINA_POR_ROL } from "./roles.js";
import { leerPerfil } from "./lecturas.js";

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

// Ojito: alterna entre ocultar y mostrar la contraseña.
const campoContrasena = document.getElementById("contrasena");
const botonOjo = document.getElementById("ver-contrasena");
const iconoOjo = document.getElementById("icono-ojo");
const OJO_ABIERTO = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
const OJO_TACHADO = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

botonOjo.addEventListener("click", () => {
  const mostrar = campoContrasena.type === "password";
  campoContrasena.type = mostrar ? "text" : "password";
  iconoOjo.innerHTML = mostrar ? OJO_TACHADO : OJO_ABIERTO;
  const texto = mostrar ? "Ocultar contraseña" : "Mostrar contraseña";
  botonOjo.setAttribute("aria-label", texto);
  botonOjo.title = texto;
});

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

    // "Recuérdame" mantiene la sesión abierta aunque se cierre el navegador; sin marcarlo, la sesión termina al cerrarlo.
    await setPersistence(auth, recordarCheckbox.checked ? browserLocalPersistence : browserSessionPersistence);
    const credencial = await signInWithEmailAndPassword(auth, correo, contrasena);
    const uid = credencial.user.uid;

    const perfil = await leerPerfil(doc(db, "usuarios", uid), uid);
    if (!perfil) {
      mostrarMensaje("Tu cuenta no tiene un perfil asignado. Contacta al administrador.", "error");
      return;
    }
    if (perfil.sinConfirmar) {
      mostrarMensaje("Tu contraseña es correcta, pero Firebase no responde por ahora. Intenta de nuevo más tarde.", "error");
      return;
    }

    const destino = PAGINA_POR_ROL[normalizarRol(perfil.rol)];
    if (destino) {
      window.location.href = destino;
    } else {
      mostrarMensaje("Rol no reconocido. Contacta al administrador.", "error");
    }
  } catch (error) {
    mostrarMensaje("Correo o contraseña incorrectos.", "error");
  }
});

// Si ya hay una sesión abierta (por "Recuérdame"), entra directo a la página que le toca.
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const perfil = await leerPerfil(doc(db, "usuarios", user.uid), user.uid);
    if (!perfil || perfil.sinConfirmar) return;
    const destino = PAGINA_POR_ROL[normalizarRol(perfil.rol)];
    if (destino) window.location.href = destino;
  } catch (error) {
    // Si falla la consulta, se queda en el login para que inicie sesión a mano.
  }
});

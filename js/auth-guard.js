import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// Revisa que haya sesión y que el rol coincida con el permitido para la página actual.
// rolRequerido: "trabajador" o "ejecutivo"
// Devuelve una Promise que resuelve con { uid, nombre, rol } cuando todo es válido.
export function protegerPagina(rolRequerido) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }

      const usuarioDoc = await getDoc(doc(db, "usuarios", user.uid));
      if (!usuarioDoc.exists()) {
        await signOut(auth);
        window.location.href = "index.html";
        return;
      }

      const datos = usuarioDoc.data();
      if (datos.rol !== rolRequerido) {
        window.location.href = datos.rol === "ejecutivo" ? "dashboard.html" : "registro.html";
        return;
      }

      resolve({ uid: user.uid, nombre: datos.nombre || user.email, rol: datos.rol });
    });
  });
}

export function configurarBotonSalir(idBoton) {
  document.getElementById(idBoton).addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

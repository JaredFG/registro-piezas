import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";
import { normalizarRol, PAGINA_POR_ROL } from "./roles.js";

// Revisa que haya sesión y que el rol del usuario esté entre los permitidos para la página actual.
// rolesPermitidos: un rol ("operador") o una lista (["administrador", "analista"]).
// Devuelve una Promise que resuelve con { uid, nombre, rol, equipo } cuando todo es válido.
export function protegerPagina(rolesPermitidos) {
  const permitidos = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
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
      const rol = normalizarRol(datos.rol);
      if (!permitidos.includes(rol)) {
        const destino = PAGINA_POR_ROL[rol];
        if (!destino) {
          await signOut(auth);
          window.location.href = "index.html";
        } else {
          window.location.href = destino;
        }
        return;
      }

      resolve({ uid: user.uid, nombre: datos.nombre || user.email, rol, equipo: datos.equipo || "" });
    });
  });
}

export function configurarBotonSalir(idBoton) {
  document.getElementById(idBoton).addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

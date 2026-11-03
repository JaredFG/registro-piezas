// Roles de la app: "administrador", "analista" y "operador".
// Los nombres anteriores se siguen aceptando: "ejecutivo" = administrador, "trabajador" = operador.
export function normalizarRol(rol) {
  if (rol === "ejecutivo") return "administrador";
  if (rol === "trabajador") return "operador";
  return rol;
}

export const PAGINA_POR_ROL = {
  administrador: "dashboard.html",
  analista: "analista.html",
  operador: "registro.html"
};

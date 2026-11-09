import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { iniciarDashboard } from "./dashboard-comun.js";

protegerPagina("administrador").then((usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");
  iniciarDashboard("dashboard-raiz", { puedeConfigurar: true });
});

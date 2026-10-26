import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { ZONAS_ORIGEN, ZONAS_DESTINO, llenarSelectZonas } from "./zonas.js";

llenarSelectZonas("f-zona-origen", ZONAS_ORIGEN);
llenarSelectZonas("f-zona-destino", ZONAS_DESTINO);

let todosLosRegistros = [];

// El texto lo escriben los trabajadores; se escapa para que no se interprete como HTML.
function escaparHtml(valor) {
  const div = document.createElement("div");
  div.textContent = valor ?? "";
  return div.innerHTML;
}

function formatearFecha(timestamp) {
  if (!timestamp) return "—";
  return timestamp.toDate().toLocaleString("es-MX");
}

function renderizarTabla(registros) {
  const contenedor = document.getElementById("zona-tabla");

  if (registros.length === 0) {
    contenedor.innerHTML = '<div class="vacio">No hay registros que coincidan con el filtro.</div>';
    return;
  }

  const filas = registros.map(r => `
    <tr>
      <td>${formatearFecha(r.creadoEn)}</td>
      <td>${escaparHtml(r.folio)}</td>
      <td>${escaparHtml(r.nombrePieza)}</td>
      <td>${escaparHtml(r.cliente)}</td>
      <td>${escaparHtml(r.material)}</td>
      <td>${escaparHtml(r.cantidad)}</td>
      <td>${escaparHtml(r.zonaOrigen)}</td>
      <td>${escaparHtml(r.zonaDestino)}</td>
      <td>${escaparHtml(r.nombreTrabajador)}</td>
      <td>${escaparHtml(r.comentarios)}</td>
    </tr>
  `).join("");

  contenedor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha y hora</th>
          <th>Folio</th>
          <th>Pieza</th>
          <th>Cliente</th>
          <th>Material</th>
          <th>Cantidad</th>
          <th>Zona origen</th>
          <th>Zona destino</th>
          <th>Trabajador</th>
          <th>Comentarios</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function aplicarFiltros() {
  const folio = document.getElementById("f-folio").value.trim().toLowerCase();
  const zonaOrigen = document.getElementById("f-zona-origen").value;
  const zonaDestino = document.getElementById("f-zona-destino").value;
  const trabajador = document.getElementById("f-trabajador").value.trim().toLowerCase();
  const cliente = document.getElementById("f-cliente").value.trim().toLowerCase();
  const desde = document.getElementById("f-desde").value;
  const hasta = document.getElementById("f-hasta").value;

  const filtrados = todosLosRegistros.filter(r => {
    if (folio && !(r.folio || "").toLowerCase().includes(folio)) return false;
    if (zonaOrigen && r.zonaOrigen !== zonaOrigen) return false;
    if (zonaDestino && r.zonaDestino !== zonaDestino) return false;
    if (trabajador && !(r.nombreTrabajador || "").toLowerCase().includes(trabajador)) return false;
    if (cliente && !(r.cliente || "").toLowerCase().includes(cliente)) return false;

    if (r.creadoEn) {
      const fechaRegistro = r.creadoEn.toDate();
      if (desde && fechaRegistro < new Date(desde + "T00:00:00")) return false;
      if (hasta && fechaRegistro > new Date(hasta + "T23:59:59")) return false;
    }

    return true;
  });

  renderizarTabla(filtrados);
}

document.getElementById("btn-filtrar").addEventListener("click", aplicarFiltros);
document.getElementById("btn-limpiar").addEventListener("click", () => {
  document.getElementById("f-folio").value = "";
  document.getElementById("f-zona-origen").value = "";
  document.getElementById("f-zona-destino").value = "";
  document.getElementById("f-trabajador").value = "";
  document.getElementById("f-cliente").value = "";
  document.getElementById("f-desde").value = "";
  document.getElementById("f-hasta").value = "";
  renderizarTabla(todosLosRegistros);
});

protegerPagina("ejecutivo").then(async (usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");

  try {
    const snapshot = await getDocs(query(collection(db, "registros"), orderBy("creadoEn", "desc")));
    todosLosRegistros = snapshot.docs.map(d => d.data());
    renderizarTabla(todosLosRegistros);
  } catch (error) {
    document.getElementById("zona-tabla").innerHTML = '<div class="vacio">Error al cargar los registros.</div>';
  }
});

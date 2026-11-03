import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { ZONAS_ORIGEN, ZONAS_DESTINO } from "./zonas.js";
import { EQUIPOS } from "./equipos.js";
import { medidasPendientes } from "./medidas.js";

// Dashboard compartido por administradores y analistas: filtros, gráficas y tabla.
// Se pinta dentro del elemento con el id que se le pase y devuelve { recargar }.

const PLANTILLA = `
  <div class="filtros">
    <div><label for="f-folio">Folio</label><input type="text" id="f-folio" placeholder="Buscar folio..." /></div>
    <div><label for="f-equipo">Equipo</label><select id="f-equipo"><option value="">Todos</option></select></div>
    <div><label for="f-zona-origen">Zona origen</label><select id="f-zona-origen"><option value="">Todas</option></select></div>
    <div><label for="f-zona-destino">Zona destino</label><select id="f-zona-destino"><option value="">Todas</option></select></div>
    <div><label for="f-operador">Operador</label><input type="text" id="f-operador" placeholder="Nombre..." /></div>
    <div><label for="f-cliente">Cliente</label><input type="text" id="f-cliente" placeholder="Cliente..." /></div>
    <div><label for="f-desde">Desde</label><input type="date" id="f-desde" /></div>
    <div><label for="f-hasta">Hasta</label><input type="date" id="f-hasta" /></div>
    <div><button id="btn-filtrar">Filtrar</button></div>
    <div><button id="btn-limpiar">Limpiar</button></div>
  </div>

  <div class="resumen">
    <div class="kpi"><span class="kpi-numero" id="kpi-folios">–</span><span class="kpi-texto">Folios preparados</span></div>
    <div class="kpi"><span class="kpi-numero" id="kpi-movimientos">–</span><span class="kpi-texto">Movimientos registrados</span></div>
    <div class="kpi kpi-alerta"><span class="kpi-numero" id="kpi-pendientes">–</span><span class="kpi-texto">Folios pendientes de medir</span></div>
  </div>

  <div class="graficas">
    <div class="grafica-card"><h3>Folios preparados por operador</h3><div class="grafica-caja"><canvas id="g-operador"></canvas></div></div>
    <div class="grafica-card"><h3>Folios preparados por equipo</h3><div class="grafica-caja"><canvas id="g-equipo"></canvas></div></div>
    <div class="grafica-card"><h3>Folios preparados por fecha</h3><div class="grafica-caja"><canvas id="g-fecha"></canvas></div></div>
    <div class="grafica-card"><h3>Carga pendiente por preparar (sin medidas)</h3><div class="grafica-caja"><canvas id="g-pendiente"></canvas></div></div>
  </div>

  <h3 class="titulo-seccion">Folios pendientes de medir</h3>
  <div id="zona-pendientes"></div>

  <h3 class="titulo-seccion">Registros</h3>
  <div id="zona-tabla"><div class="cargando">Cargando registros...</div></div>
`;

// El texto lo escriben los operadores; se escapa para que no se interprete como HTML.
function escaparHtml(valor) {
  const div = document.createElement("div");
  div.textContent = valor ?? "";
  return div.innerHTML;
}

function formatearFecha(timestamp) {
  if (!timestamp) return "—";
  return timestamp.toDate().toLocaleString("es-MX");
}

// "2026-11-03" -> "03/11/2026" (sin pasar por Date para evitar desfases de zona horaria).
function formatearFechaTexto(texto) {
  if (!texto) return "—";
  const [a, m, d] = texto.split("-");
  return `${d}/${m}/${a}`;
}

function claveDia(timestamp) {
  const f = timestamp.toDate();
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const dia = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${mes}-${dia}`;
}

const nombreOperadorDe = (r) => r.nombreOperador ?? r.nombreTrabajador ?? "";
const equipoDe = (r) => r.equipo || "Sin equipo";

export function iniciarDashboard(idContenedor) {
  const raiz = document.getElementById(idContenedor);
  raiz.innerHTML = PLANTILLA;

  const el = (id) => document.getElementById(id);
  let registros = [];
  let piezas = [];
  let piezaPorFolio = new Map();
  const graficas = {};

  function llenarSelect(id, valores) {
    const select = el(id);
    valores.forEach(v => {
      const opcion = document.createElement("option");
      opcion.value = v;
      opcion.textContent = v;
      select.appendChild(opcion);
    });
  }
  llenarSelect("f-equipo", EQUIPOS);
  llenarSelect("f-zona-origen", ZONAS_ORIGEN);
  llenarSelect("f-zona-destino", ZONAS_DESTINO);

  function leerFiltros() {
    return {
      folio: el("f-folio").value.trim().toLowerCase(),
      equipo: el("f-equipo").value,
      zonaOrigen: el("f-zona-origen").value,
      zonaDestino: el("f-zona-destino").value,
      operador: el("f-operador").value.trim().toLowerCase(),
      cliente: el("f-cliente").value.trim().toLowerCase(),
      desde: el("f-desde").value,
      hasta: el("f-hasta").value
    };
  }

  function filtrarRegistros(f) {
    return registros.filter(r => {
      if (f.folio && !(r.folio || "").toLowerCase().includes(f.folio)) return false;
      if (f.equipo && r.equipo !== f.equipo) return false;
      if (f.zonaOrigen && r.zonaOrigen !== f.zonaOrigen) return false;
      if (f.zonaDestino && r.zonaDestino !== f.zonaDestino) return false;
      if (f.operador && !nombreOperadorDe(r).toLowerCase().includes(f.operador)) return false;
      if (f.cliente && !(r.cliente || "").toLowerCase().includes(f.cliente)) return false;
      if (r.creadoEn) {
        const fecha = r.creadoEn.toDate();
        if (f.desde && fecha < new Date(f.desde + "T00:00:00")) return false;
        if (f.hasta && fecha > new Date(f.hasta + "T23:59:59")) return false;
      }
      return true;
    });
  }

  // Piezas que cumplen los filtros que describen a la pieza: folio, equipo y cliente.
  function filtrarPiezas(f) {
    return piezas.filter(p => {
      if (f.folio && !(p.folio || "").toLowerCase().includes(f.folio)) return false;
      if (f.equipo && p.equipo !== f.equipo) return false;
      if (f.cliente && !(p.cliente || "").toLowerCase().includes(f.cliente)) return false;
      return true;
    });
  }

  // Cuenta folios distintos por categoría: un folio con varios movimientos cuenta una sola vez.
  function contarFoliosPor(lista, obtenerClave) {
    const mapa = new Map();
    lista.forEach(r => {
      const clave = obtenerClave(r);
      if (!clave) return;
      if (!mapa.has(clave)) mapa.set(clave, new Set());
      mapa.get(clave).add(r.folio);
    });
    return mapa;
  }

  function dibujar(id, tipo, etiquetas, datos, opciones = {}) {
    if (typeof Chart === "undefined") return;
    if (graficas[id]) graficas[id].destroy();
    graficas[id] = new Chart(el(id), {
      type: tipo,
      data: {
        labels: etiquetas,
        datasets: [{
          data: datos,
          backgroundColor: opciones.colores || "#dc2626",
          borderColor: opciones.borde || "#dc2626",
          borderWidth: tipo === "line" ? 2 : 0,
          fill: tipo === "line",
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: opciones.horizontal ? "y" : "x",
        plugins: { legend: { display: tipo === "doughnut" } },
        scales: tipo === "doughnut" ? {} : {
          x: { ticks: { precision: 0 }, beginAtZero: true },
          y: { ticks: { precision: 0 }, beginAtZero: true }
        }
      }
    });
  }

  function ordenarPorConteo(mapa) {
    return [...mapa.entries()].map(([k, v]) => [k, v.size]).sort((a, b) => b[1] - a[1]);
  }

  function pintarGraficas(filtrados, piezasFiltradas) {
    const porOperador = ordenarPorConteo(contarFoliosPor(filtrados, nombreOperadorDe));
    dibujar("g-operador", "bar", porOperador.map(e => e[0]), porOperador.map(e => e[1]), { horizontal: true });

    const porEquipo = ordenarPorConteo(contarFoliosPor(filtrados, equipoDe));
    dibujar("g-equipo", "bar", porEquipo.map(e => e[0]), porEquipo.map(e => e[1]));

    const porDia = contarFoliosPor(filtrados.filter(r => r.creadoEn), r => claveDia(r.creadoEn));
    const dias = [...porDia.keys()].sort();
    dibujar("g-fecha", "line", dias.map(formatearFechaTexto), dias.map(d => porDia.get(d).size),
      { colores: "rgba(220,38,38,0.15)" });

    const pendientes = piezasFiltradas.filter(p => medidasPendientes(p.medidas)).length;
    dibujar("g-pendiente", "doughnut", ["Con medidas", "Pendientes de medir"],
      [piezasFiltradas.length - pendientes, pendientes], { colores: ["#16a34a", "#dc2626"], borde: "#ffffff" });
  }

  function pintarPendientes(pendientes) {
    const caja = el("zona-pendientes");
    if (pendientes.length === 0) {
      caja.innerHTML = '<div class="vacio">No hay folios pendientes de medir.</div>';
      return;
    }
    const filas = pendientes.map(p => `
      <tr>
        <td>${escaparHtml(p.folio)}</td>
        <td>${escaparHtml(p.op)}</td>
        <td>${escaparHtml(p.estandar ?? p.nombre)}</td>
        <td>${escaparHtml(p.cliente)}</td>
        <td>${escaparHtml(p.equipo || "Sin equipo")}</td>
      </tr>`).join("");
    caja.innerHTML = `
      <table>
        <thead><tr><th>Folio</th><th>OP</th><th>Estándar</th><th>Cliente</th><th>Equipo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`;
  }

  function pintarTabla(filtrados) {
    const caja = el("zona-tabla");
    if (filtrados.length === 0) {
      caja.innerHTML = '<div class="vacio">No hay registros que coincidan con el filtro.</div>';
      return;
    }
    const filas = filtrados.map(r => {
      const ficha = piezaPorFolio.get(r.folio);
      return `
      <tr>
        <td>${formatearFecha(r.creadoEn)}</td>
        <td>${escaparHtml(r.folio)}</td>
        <td>${escaparHtml(r.op)}</td>
        <td>${escaparHtml(r.estandarPieza ?? r.nombrePieza)}</td>
        <td>${escaparHtml(r.cliente)}</td>
        <td>${escaparHtml(r.material)}</td>
        <td>${escaparHtml(r.cantidad)}</td>
        <td>${escaparHtml(r.factura)}</td>
        <td>${escaparHtml(r.medidas)}</td>
        <td>${escaparHtml(r.zonaOrigen)}</td>
        <td>${escaparHtml(r.zonaDestino)}</td>
        <td>${escaparHtml(nombreOperadorDe(r))}</td>
        <td>${escaparHtml(r.equipo)}</td>
        <td>${escaparHtml(formatearFechaTexto(ficha?.fechaLiberacion))}</td>
        <td>${escaparHtml(r.comentarios)}</td>
      </tr>`;
    }).join("");
    caja.innerHTML = `
      <div class="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha y hora</th><th>Folio</th><th>OP</th><th>Estándar</th><th>Cliente</th><th>Material</th>
            <th>Cantidad</th><th>Factura</th><th>Medidas</th><th>Zona origen</th><th>Zona destino</th>
            <th>Operador</th><th>Equipo</th><th>Fecha liberación</th><th>Comentarios</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      </div>`;
  }

  function actualizar() {
    const f = leerFiltros();
    const filtrados = filtrarRegistros(f);
    const piezasFiltradas = filtrarPiezas(f);
    const pendientes = piezasFiltradas.filter(p => medidasPendientes(p.medidas));

    el("kpi-folios").textContent = new Set(filtrados.map(r => r.folio)).size;
    el("kpi-movimientos").textContent = filtrados.length;
    el("kpi-pendientes").textContent = pendientes.length;

    pintarGraficas(filtrados, piezasFiltradas);
    pintarPendientes(pendientes);
    pintarTabla(filtrados);
  }

  el("btn-filtrar").addEventListener("click", actualizar);
  el("btn-limpiar").addEventListener("click", () => {
    ["f-folio", "f-equipo", "f-zona-origen", "f-zona-destino", "f-operador", "f-cliente", "f-desde", "f-hasta"]
      .forEach(id => { el(id).value = ""; });
    actualizar();
  });

  async function recargar() {
    try {
      const [snapRegistros, snapPiezas] = await Promise.all([
        getDocs(query(collection(db, "registros"), orderBy("creadoEn", "desc"))),
        getDocs(collection(db, "piezas"))
      ]);
      registros = snapRegistros.docs.map(d => d.data());
      piezas = snapPiezas.docs.map(d => d.data());
      piezaPorFolio = new Map(piezas.map(p => [p.folio, p]));
      actualizar();
    } catch (error) {
      el("zona-tabla").innerHTML = '<div class="vacio">Error al cargar los registros.</div>';
    }
  }

  recargar();
  return { recargar };
}

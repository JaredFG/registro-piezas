import { collection, doc, setDoc, query, orderBy, where, Timestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { leerDocumento, leerColeccion } from "./lecturas.js";
import { EQUIPOS } from "./equipos.js";
import { medidasPendientes } from "./medidas.js";
import { RACKS, POSICIONES, NIVELES, FRECUENCIAS, FRECUENCIA_DEFAULT, LARGO_NIVEL, ALTURA_NIVEL, idUbicacion, estadoCelda, largoUsado, normalizarCelda, piezasDeCelda } from "./optimizacion.js";

// Dashboard compartido por administradores y analistas: filtros, gráficas y tabla.
// Se pinta dentro del elemento con el id que se le pase y devuelve { recargar }.

const PLANTILLA = `
  <div class="barra-actualizar">
    <button type="button" id="btn-actualizar">&#8635; Actualizar</button>
    <button type="button" id="btn-recarga-completa" class="secundario">Recarga completa</button>
    <span id="estado-actualizacion" class="estado-actualizacion"></span>
  </div>
  <div class="filtros">
    <div><label for="f-folio">Pieza</label><input type="text" id="f-folio" placeholder="Buscar pieza..." /></div>
    <div><label for="f-equipo">Equipo</label><select id="f-equipo"><option value="">Todos</option></select></div>
    <div><label for="f-zona-origen">Zona origen</label><input type="text" id="f-zona-origen" placeholder="Ej. A1-N0..." /></div>
    <div><label for="f-zona-destino">Zona destino</label><input type="text" id="f-zona-destino" placeholder="Ej. A1-N0..." /></div>
    <div><label for="f-operador">Operador</label><input type="text" id="f-operador" placeholder="Nombre..." /></div>
    <div><label for="f-cliente">Cliente</label><input type="text" id="f-cliente" placeholder="Cliente..." /></div>
    <div><label for="f-op">OP</label><input type="text" id="f-op" placeholder="OP..." /></div>
    <div><label for="f-factura">Factura</label><input type="text" id="f-factura" placeholder="Factura..." /></div>
    <div><label for="f-piezas">Folio</label><input type="text" id="f-piezas" placeholder="Folio..." /></div>
    <div><label for="f-factura-desde">Fecha factura desde</label><input type="date" id="f-factura-desde" /></div>
    <div><label for="f-factura-hasta">Fecha factura hasta</label><input type="date" id="f-factura-hasta" /></div>
    <div><label for="f-desde">Desde</label><input type="date" id="f-desde" /></div>
    <div><label for="f-hasta">Hasta</label><input type="date" id="f-hasta" /></div>
    <div><button id="btn-filtrar">Filtrar</button></div>
    <div><button id="btn-limpiar">Limpiar</button></div>
  </div>

  <div class="resumen">
    <div class="kpi"><span class="kpi-numero" id="kpi-folios">–</span><span class="kpi-texto">Piezas preparadas</span></div>
    <div class="kpi"><span class="kpi-numero" id="kpi-movimientos">–</span><span class="kpi-texto">Movimientos registrados</span></div>
    <div class="kpi kpi-alerta"><span class="kpi-numero" id="kpi-pendientes">–</span><span class="kpi-texto">Piezas pendientes de medir</span></div>
  </div>

  <h3 class="titulo-seccion">Racks</h3>
  <div class="rack-panel">
    <div class="rack-encabezado">
      <div id="rack-resumen">Cargando racks...</div>
      <div id="rack-config"></div>
    </div>
    <div class="rack-cuerpo">
      <div class="rack-mapa" id="rack-mapa"></div>
      <div class="rack-lateral">
        <h4>Niveles</h4>
        <div id="rack-niveles"></div>
        <div class="rack-simbologia">
          <div><i></i> Disponible</div>
          <div><i class="parcial"></i> Parcialmente ocupado</div>
          <div><i class="ocupado"></i> Completo</div>
        </div>
      </div>
    </div>
    <div class="rack-detalle" id="rack-detalle"></div>
  </div>

  <div class="graficas">
    <div class="grafica-card"><h3>Piezas preparadas por operador</h3><div class="grafica-caja"><canvas id="g-operador"></canvas></div></div>
    <div class="grafica-card"><h3>Piezas preparadas por equipo</h3><div class="grafica-caja"><canvas id="g-equipo"></canvas></div></div>
    <div class="grafica-card"><h3>Piezas preparadas por fecha</h3><div class="grafica-caja"><canvas id="g-fecha"></canvas></div></div>
    <div class="grafica-card"><h3>Carga pendiente por preparar (sin medidas)</h3><div class="grafica-caja"><canvas id="g-pendiente"></canvas></div></div>
  </div>

  <h3 class="titulo-seccion">Piezas pendientes de medir</h3>
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

export function iniciarDashboard(idContenedor, { puedeConfigurar = false } = {}) {
  const raiz = document.getElementById(idContenedor);
  raiz.innerHTML = PLANTILLA;

  const el = (id) => document.getElementById(id);
  let registros = [];
  let piezas = [];
  let piezaPorFolio = new Map();
  const graficas = {};
  let ocupadas = {};
  let nivelActivo = null;
  let posicionActiva = null;

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

  function leerFiltros() {
    return {
      folio: el("f-folio").value.trim().toLowerCase(),
      equipo: el("f-equipo").value,
      zonaOrigen: el("f-zona-origen").value.trim().toLowerCase(),
      zonaDestino: el("f-zona-destino").value.trim().toLowerCase(),
      operador: el("f-operador").value.trim().toLowerCase(),
      cliente: el("f-cliente").value.trim().toLowerCase(),
      op: el("f-op").value.trim().toLowerCase(),
      factura: el("f-factura").value.trim(),
      piezas: el("f-piezas").value.trim().toLowerCase(),
      facturaDesde: el("f-factura-desde").value,
      facturaHasta: el("f-factura-hasta").value,
      desde: el("f-desde").value,
      hasta: el("f-hasta").value
    };
  }

  // Filtros de los campos de la pieza (OP, factura, piezas, fecha de factura): sirven igual para un registro o para una ficha.
  function cumpleCamposNuevos(x, f) {
    if (f.op && !String(x.op ?? "").toLowerCase().includes(f.op)) return false;
    if (f.factura && !String(x.factura ?? "").includes(f.factura)) return false;
    if (f.piezas && !String(x.piezas ?? "").toLowerCase().includes(f.piezas)) return false;
    if (f.facturaDesde && !(x.fechaFactura && x.fechaFactura >= f.facturaDesde)) return false;
    if (f.facturaHasta && !(x.fechaFactura && x.fechaFactura <= f.facturaHasta)) return false;
    return true;
  }

  function filtrarRegistros(f) {
    return registros.filter(r => {
      if (f.folio && !(r.folio || "").toLowerCase().includes(f.folio)) return false;
      if (f.equipo && r.equipo !== f.equipo) return false;
      if (f.zonaOrigen && !(r.zonaOrigen || "").toLowerCase().includes(f.zonaOrigen)) return false;
      if (f.zonaDestino && !(r.zonaDestino || "").toLowerCase().includes(f.zonaDestino)) return false;
      if (f.operador && !nombreOperadorDe(r).toLowerCase().includes(f.operador)) return false;
      if (f.cliente && !(r.cliente || "").toLowerCase().includes(f.cliente)) return false;
      if (!cumpleCamposNuevos(r, f)) return false;
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
      if (!cumpleCamposNuevos(p, f)) return false;
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
      caja.innerHTML = '<div class="vacio">No hay piezas pendientes de medir.</div>';
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
      <div class="tabla-ajustable tabla-limitada">
      <table>
        <thead><tr><th>Pieza</th><th>OP</th><th>Estándar</th><th>Cliente</th><th>Equipo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      </div>`;
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
        <td>${escaparHtml(r.fechaFactura)}</td>
        <td>${escaparHtml(r.piezas)}</td>
        <td>${escaparHtml(r.cantidad)}</td>
        <td>${escaparHtml(r.factura)}</td>
        <td>${escaparHtml(r.tipo || r.medidas)}</td>
        <td>${escaparHtml(r.zonaOrigen)}</td>
        <td>${escaparHtml(r.zonaDestino)}</td>
        <td>${escaparHtml(nombreOperadorDe(r))}</td>
        <td>${escaparHtml(r.equipo)}</td>
        <td>${escaparHtml(formatearFechaTexto(ficha?.fechaLiberacion))}</td>
        <td>${escaparHtml(r.comentarios)}</td>
        <td>${escaparHtml(r.estado)}</td>
      </tr>`;
    }).join("");
    caja.innerHTML = `
      <div class="tabla-scroll">
      <table>
        <thead>
          <tr>
            <th>Fecha y hora</th><th>Pieza</th><th>OP</th><th>Estándar</th><th>Cliente</th><th>Material</th><th>Fecha factura</th><th>Folio</th>
            <th>Cantidad</th><th>Factura</th><th>Medidas</th><th>Zona origen</th><th>Zona destino</th>
            <th>Operador</th><th>Equipo</th><th>Fecha liberación</th><th>Comentarios</th><th>Estado de las piezas</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      </div>`;
  }

  // Niveles de una posición que ya tienen piezas (parciales o completos).
  function ocupadosDePosicion(rack, posicion) {
    return NIVELES.filter(n => estadoCelda(ocupadas[idUbicacion(rack, posicion, n)]) !== "libre").length;
  }

  function completosDePosicion(rack, posicion) {
    return NIVELES.filter(n => estadoCelda(ocupadas[idUbicacion(rack, posicion, n)]) === "completa").length;
  }

  function pintarDetalleRack() {
    const caja = el("rack-detalle");
    if (!posicionActiva) {
      caja.innerHTML = '<div class="vacio">Elige una posición del mapa para ver sus piezas.</div>';
      return;
    }
    const { rack, posicion } = posicionActiva;
    const ESTADOS = { libre: "Disponible", parcial: "Parcialmente ocupado", completa: "Completo" };
    const filas = [...NIVELES].reverse().map(n => {
      const celda = ocupadas[idUbicacion(rack, posicion, n)];
      const estado = estadoCelda(celda);
      if (estado === "libre") return `<tr><td>N${n}</td><td colspan="9">Disponible</td></tr>`;
      const usado = largoUsado(celda);
      const estibas = normalizarCelda(celda).estibas;
      return estibas.map((estiba, k) => estiba.p.map((folio, nivelEstiba) => {
        const p = piezaPorFolio.get(folio) || {};
        return `
      <tr>
        <td>${k === 0 && nivelEstiba === 0 ? `N${n}<small> ${ESTADOS[estado]} · ${usado} de ${LARGO_NIVEL} in</small>` : ""}</td>
        <td>${escaparHtml(folio)}${estiba.p.length > 1 ? `<small> (estiba ${k + 1}, lugar ${nivelEstiba + 1})</small>` : ""}</td>
        <td>${escaparHtml(p.piezas)}</td>
        <td>${escaparHtml(p.cantidad)}</td>
        <td>${escaparHtml(p.cliente)}</td>
        <td>${escaparHtml(p.estandar ?? p.nombre)}</td>
        <td>${escaparHtml(p.op)}</td>
        <td>${escaparHtml(p.tipo || p.medidas || "Pendiente")}</td>
        <td>${escaparHtml(p.equipo)}</td>
        <td>${estiba.c ? "Completa" : "Admite más"}</td>
      </tr>`;
      }).join("")).join("");
    }).join("");
    // Esquema del estante: cada nivel es una barra de 96 pulgadas y cada estiba ocupa su largo.
    const esquema = [...NIVELES].reverse().map(n => {
      const celda = ocupadas[idUbicacion(rack, posicion, n)];
      const estibas = normalizarCelda(celda).estibas;
      const tarimas = estibas.map(e => `<div class="estante-tarima ${e.c ? "completa" : "abierta"}" style="width:${(e.l / LARGO_NIVEL) * 100}%" title="${escaparHtml(e.p.join(", "))}${e.c ? " (estiba completa)" : " (admite más encima)"}">${e.p.length}</div>`).join("");
      return `<div class="estante-nivel"><span class="estante-etiqueta">N${n}<small>${ALTURA_NIVEL[n]} in</small></span><div class="estante-barra ${estadoCelda(celda)}">${tarimas}</div></div>`;
    }).join("");
    caja.innerHTML = `
      <h4>Posición ${rack}${posicion}</h4>
      <div class="estante">${esquema}</div>
      <p class="estante-leyenda"><i class="completa"></i> Estiba completa <i class="abierta"></i> Admite más piezas encima. El número es la cantidad de piezas apiladas.</p>
      <div class="tabla-ajustable">
      <table>
        <thead><tr><th>Nivel</th><th>Pieza</th><th>Folio</th><th>Cantidad</th><th>Cliente</th><th>Estándar</th><th>OP</th><th>Tarima o caja</th><th>Equipo</th><th>Estiba</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      </div>`;
  }

  function pintarMapaRacks() {
    const totalNivel = RACKS.length * POSICIONES;
    const total = totalNivel * NIVELES.length;
    const ids = Object.keys(ocupadas).filter(id => estadoCelda(ocupadas[id]) !== "libre");
    const completas = ids.filter(id => estadoCelda(ocupadas[id]) === "completa").length;
    const piezasPorRack = Object.fromEntries(RACKS.map(r => [r, 0]));
    ids.forEach(id => { piezasPorRack[id[0]] += piezasDeCelda(ocupadas[id]).length; });
    const totalPiezas = Object.values(piezasPorRack).reduce((a, b) => a + b, 0);
    el("rack-resumen").textContent =
      `${totalPiezas} piezas en ${ids.length} de ${total} ubicaciones ocupadas (${Math.round((ids.length / total) * 100)}%): ${completas} completas y ${ids.length - completas} parciales.`;

    const encabezados = RACKS.map(rack => {
      const conteo = ids.filter(id => id.startsWith(rack)).length;
      const piezasRack = piezasPorRack[rack];
      return `<th scope="col">${rack}<small>${Math.round((conteo / (POSICIONES * NIVELES.length)) * 100)}%</small><small>${piezasRack} ${piezasRack === 1 ? "pieza" : "piezas"}</small></th>`;
    }).join("");

    const filas = Array.from({ length: POSICIONES }, (_, i) => i + 1).map(posicion => {
      const celdas = RACKS.map(rack => {
        const llenos = ocupadosDePosicion(rack, posicion);
        const completos = completosDePosicion(rack, posicion);
        const estado = nivelActivo === null
          ? (llenos === 0 ? "" : completos === NIVELES.length ? "ocupado" : "parcial")
          : ({ libre: "", parcial: "parcial", completa: "ocupado" })[estadoCelda(ocupadas[idUbicacion(rack, posicion, nivelActivo)])];
        const activa = posicionActiva?.rack === rack && posicionActiva?.posicion === posicion ? "activa" : "";
        return `<td><button type="button" class="rack-celda ${estado} ${activa}" data-rack="${rack}" data-posicion="${posicion}" title="${llenos} de ${NIVELES.length} niveles con piezas, ${completos} completos">${rack}${posicion}</button></td>`;
      }).join("");
      return `<tr>${celdas}</tr>`;
    }).join("");
    el("rack-mapa").innerHTML = `<table><thead><tr>${encabezados}</tr></thead><tbody>${filas}</tbody></table>`;

    const botonNivel = (nivel, etiqueta, ocupados, capacidad) => `
      <button type="button" class="rack-nivel ${nivelActivo === nivel ? "activo" : ""}" data-nivel="${nivel ?? ""}">
        <span>${etiqueta}</span>
        <span class="rack-barra"><span style="width:${(ocupados / capacidad) * 100}%"></span></span>
        <span>${Math.round((ocupados / capacidad) * 100)}%</span>
      </button>`;
    el("rack-niveles").innerHTML = botonNivel(null, "Todos", ids.length, total) +
      [...NIVELES].reverse().map(n => botonNivel(n, `N${n}`, ids.filter(id => id.endsWith(`-N${n}`)).length, totalNivel)).join("");

    pintarDetalleRack();
  }

  el("rack-mapa").addEventListener("click", (e) => {
    const celda = e.target.closest(".rack-celda");
    if (!celda) return;
    posicionActiva = { rack: celda.dataset.rack, posicion: Number(celda.dataset.posicion) };
    pintarMapaRacks();
  });

  el("rack-niveles").addEventListener("click", (e) => {
    const boton = e.target.closest(".rack-nivel");
    if (!boton) return;
    nivelActivo = boton.dataset.nivel === "" ? null : Number(boton.dataset.nivel);
    pintarMapaRacks();
  });

  function pintarConfiguracion(frecuencia, pesos) {
    const calculados = pesos?.periodo ? `Pesos del periodo ${escaparHtml(pesos.periodo)}.` : "Pesos sin calcular.";
    if (!puedeConfigurar) {
      el("rack-config").textContent = calculados;
      return;
    }
    const opciones = Object.entries(FRECUENCIAS)
      .map(([valor, texto]) => `<option value="${valor}" ${valor === frecuencia ? "selected" : ""}>${texto}</option>`).join("");
    el("rack-config").innerHTML = `
      <label for="rack-frecuencia">Recalcular pesos</label>
      <select id="rack-frecuencia">${opciones}</select>
      <div>${calculados}</div>`;
    el("rack-frecuencia").addEventListener("change", async (e) => {
      try {
        await setDoc(doc(db, "config", "ajustes"), { frecuencia: e.target.value }, { merge: true });
      } catch (error) {
        console.error("No se pudo guardar la frecuencia:", error);
        alert("No se pudo guardar la frecuencia.");
      }
    });
  }

  async function recargarRacks() {
    try {
      const [ocupacion, pesos, ajustes] = await Promise.all([
        leerDocumento(doc(db, "config", "ocupacion")),
        leerDocumento(doc(db, "config", "pesos")),
        leerDocumento(doc(db, "config", "ajustes"))
      ]);
      ocupadas = ocupacion.data()?.ubicaciones || {};
      pintarMapaRacks();
      pintarConfiguracion(ajustes.data()?.frecuencia || FRECUENCIA_DEFAULT, pesos.data());
    } catch (error) {
      console.error("No se pudieron cargar los racks:", error);
      el("rack-resumen").textContent = "No se pudieron cargar los racks.";
    }
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
    ["f-folio", "f-equipo", "f-zona-origen", "f-zona-destino", "f-operador", "f-cliente", "f-op", "f-factura", "f-piezas", "f-factura-desde", "f-factura-hasta", "f-desde", "f-hasta"]
      .forEach(id => { el(id).value = ""; });
    actualizar();
  });

  // ---- Carga y actualización ----
  // La carga completa lee todo una vez. "Actualizar" solo pide lo que cambió desde la última lectura y lo mezcla:
  // registros nuevos, fichas modificadas y la ocupación de los racks.
  const INTERVALO_AUTOMATICO_MS = 2 * 60 * 1000;
  let idsRegistros = new Set();
  let cursores = { registros: 0, piezas: 0, liberaciones: 0 };
  let ocupado = false;

  const milis = (marca) => marca?.toMillis?.() || 0;
  const maximo = (lista, campo) => lista.reduce((m, x) => Math.max(m, milis(x[campo])), 0);
  const horaActual = () => new Date().toLocaleTimeString("es-MX");

  function marcarCursores() {
    cursores = {
      registros: maximo(registros, "creadoEn"),
      piezas: maximo(piezas, "actualizadoEn"),
      liberaciones: maximo(piezas, "liberadoEn")
    };
  }

  function mostrarEstado(texto) {
    el("estado-actualizacion").textContent = texto;
  }

  function bloquear(valor) {
    ocupado = valor;
    el("btn-actualizar").disabled = valor;
    el("btn-recarga-completa").disabled = valor;
  }

  async function recargar() {
    try {
      const [snapRegistros, snapPiezas] = await Promise.all([
        leerColeccion(query(collection(db, "registros"), orderBy("creadoEn", "desc"))),
        leerColeccion(collection(db, "piezas"))
      ]);
      registros = snapRegistros.docs.map(d => d.data());
      idsRegistros = new Set(snapRegistros.docs.map(d => d.id));
      piezas = snapPiezas.docs.map(d => d.data());
      piezaPorFolio = new Map(piezas.map(p => [p.folio, p]));
      marcarCursores();
      actualizar();
      mostrarEstado(`Datos completos a las ${horaActual()} · se actualiza solo cada 2 minutos`);
    } catch (error) {
      el("zona-tabla").innerHTML = '<div class="vacio">Error al cargar los registros.</div>';
    }
    await recargarRacks();
  }

  async function recargarOcupacion() {
    const ocupacion = await leerDocumento(doc(db, "config", "ocupacion"));
    ocupadas = ocupacion.data()?.ubicaciones || {};
    pintarMapaRacks();
  }

  async function actualizarCambios() {
    if (ocupado) return;
    bloquear(true);
    try {
      if (!cursores.registros) {
        await recargar();
        return;
      }
      const desde = (ms) => Timestamp.fromMillis(ms);
      const [snapRegistros, snapModificadas, snapLiberadas] = await Promise.all([
        leerColeccion(query(collection(db, "registros"), where("creadoEn", ">=", desde(cursores.registros)), orderBy("creadoEn", "desc"))),
        leerColeccion(query(collection(db, "piezas"), where("actualizadoEn", ">=", desde(cursores.piezas)))),
        leerColeccion(query(collection(db, "piezas"), where("liberadoEn", ">=", desde(cursores.liberaciones))))
      ]);

      const nuevos = snapRegistros.docs.filter(d => !idsRegistros.has(d.id));
      nuevos.forEach(d => idsRegistros.add(d.id));
      if (nuevos.length) {
        registros = [...nuevos.map(d => d.data()), ...registros].sort((a, b) => milis(b.creadoEn) - milis(a.creadoEn));
      }
      const cambiadas = [...snapModificadas.docs, ...snapLiberadas.docs].map(d => d.data());
      cambiadas.forEach(p => piezaPorFolio.set(p.folio, p));
      if (cambiadas.length) piezas = [...piezaPorFolio.values()];

      marcarCursores();
      actualizar();
      await recargarOcupacion();
      mostrarEstado(`Actualizado a las ${horaActual()} · ${nuevos.length} ${nuevos.length === 1 ? "registro nuevo" : "registros nuevos"} · se actualiza solo cada 2 minutos`);
    } catch (error) {
      console.error("No se pudo actualizar:", error);
      mostrarEstado("No se pudo actualizar. Inténtalo de nuevo en un momento.");
    } finally {
      bloquear(false);
    }
  }

  async function recargaCompleta() {
    if (ocupado) return;
    bloquear(true);
    mostrarEstado("Cargando todos los datos...");
    try {
      await recargar();
    } finally {
      bloquear(false);
    }
  }

  el("btn-actualizar").addEventListener("click", actualizarCambios);
  el("btn-recarga-completa").addEventListener("click", recargaCompleta);
  // Solo se actualiza solo mientras la pestaña está a la vista.
  setInterval(() => { if (document.visibilityState === "visible") actualizarCambios(); }, INTERVALO_AUTOMATICO_MS);

  recargar();
  return { recargar: actualizarCambios, recargarCompleto: recargaCompleta };
}

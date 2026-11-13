import { collection, doc, setDoc, runTransaction, deleteField, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import { leerDocumento, leerColeccion, esFallaTemporal } from "./lecturas.js";
import { protegerPagina, configurarBotonSalir } from "./auth-guard.js";
import { CATALOGO, buscarMedida, medidasDeCatalogo } from "./catalogo.js";
import { ZONA_RACK, ZONAS_ORIGEN, ZONAS_DESTINO, llenarSelectZonas } from "./zonas.js";
import {
  RACKS, POSICIONES, NIVELES, FRECUENCIA_DEFAULT, LARGO_NIVEL, ANCHO_NIVEL, ALTURA_NIVEL, idUbicacion, parsearUbicacion,
  nivelesPorEstiba, cabeEnRack, cabeEnNivel, parsearMedidas, largoDeMedidas, altoDeMedidas, modoDeColocacion, colocarEnCelda, retirarDeCelda, piezasDeCelda,
  tamanoDeMedidas, periodoDe, calcularPesos, recomendarUbicacion
} from "./optimizacion.js";

llenarSelectZonas("zona-origen", ZONAS_ORIGEN);
llenarSelectZonas("zona-destino", ZONAS_DESTINO);

function actualizarRelojFecha() {
  document.getElementById("fecha-hora").value = new Date().toLocaleString("es-MX");
}
actualizarRelojFecha();
setInterval(actualizarRelojFecha, 1000);

const form = document.getElementById("form-registro");
const mensaje = document.getElementById("mensaje");
const campoFolio = document.getElementById("folio");
const estadoFolio = document.getElementById("estado-folio");

const campo = (id) => document.getElementById(id);
const refOcupacion = doc(db, "config", "ocupacion");
const refPesos = doc(db, "config", "pesos");
const refAjustes = doc(db, "config", "ajustes");

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + tipo;
}

function mostrarEstadoFolio(texto, tipo) {
  estadoFolio.textContent = texto;
  estadoFolio.className = "estado-folio " + (tipo || "");
}

// El folio es el ID del documento en "piezas": se normaliza para que "a12" y " A12 " sean la misma pieza.
function normalizarFolio(valor) {
  return valor.trim().toUpperCase();
}

// Firestore no acepta "/" en el ID de un documento, ni los IDs "." o "..".
function folioValido(folio) {
  return folio !== "" && !folio.includes("/") && folio !== "." && folio !== "..";
}

function llenarOpciones(select, valores, textoVacio) {
  select.innerHTML = "";
  select.add(new Option(textoVacio, ""));
  valores.forEach(v => select.add(new Option(v.texto, v.valor)));
}

const OPCIONES_RACK = RACKS.map(r => ({ texto: r, valor: r }));
const OPCIONES_POSICION = Array.from({ length: POSICIONES }, (_, i) => ({ texto: i + 1, valor: i + 1 }));
llenarOpciones(campo("rack-letra"), OPCIONES_RACK, "Elige...");
llenarOpciones(campo("rack-posicion"), OPCIONES_POSICION, "Elige...");
llenarOpciones(campo("origen-letra"), OPCIONES_RACK, "Elige...");
llenarOpciones(campo("origen-posicion"), OPCIONES_POSICION, "Elige...");
llenarOpciones(campo("origen-nivel"), NIVELES.map(n => ({ texto: `N${n}`, valor: n })), "Elige...");

// Las medidas salen de la tarima o caja elegida. Una pieza registrada antes con medidas libres las conserva
// mientras no se elija una opción.
let medidasHeredadas = "";

llenarOpciones(campo("tipo-medida"), CATALOGO.map(m => ({ texto: m.nombre, valor: m.nombre })), "Sin elegir (pendiente de medir)");

function medidasCapturadas() {
  const opcion = buscarMedida(campo("tipo-medida").value);
  return opcion ? medidasDeCatalogo(opcion) : medidasHeredadas;
}

// Respuestas de estiba: estibable y unica son true, false o null (sin contestar).
const aBooleano = (valor) => (valor === "si" ? true : valor === "no" ? false : null);
const deBooleano = (valor) => (valor === true ? "si" : valor === false ? "no" : "");

function estibaActual() {
  const estibable = aBooleano(campo("estibable").value);
  const unica = estibable === false ? aBooleano(campo("unica").value) : null;
  return { estibable, unica, lista: estibable === true || (estibable === false && unica !== null) };
}

function actualizarBloquesEstiba() {
  const { estibable } = estibaActual();
  campo("bloque-unica").hidden = estibable !== false;
  campo("bloque-encima").hidden = estibable !== true;
}

function actualizarNiveles() {
  const estiba = estibaActual();
  const select = campo("rack-nivel");
  const anterior = select.value;
  const medidas = medidasCapturadas();
  const niveles = (estiba.lista ? nivelesPorEstiba(estiba) : NIVELES).filter(n => !medidas || cabeEnNivel(medidas, n));
  llenarOpciones(select, niveles.map(n => ({ texto: `N${n}`, valor: n })), "Elige...");
  if (niveles.includes(Number(anterior)) && anterior !== "") select.value = anterior;

  const aviso = campo("tamano-pieza");
  const m = parsearMedidas(medidas);
  if (!m) aviso.textContent = "Sin tarima o caja: pendiente de medir.";
  else if (!cabeEnRack(medidas)) aviso.textContent = `No cabe en un rack: pasa de ${LARGO_NIVEL} × ${ANCHO_NIVEL} pulgadas o de la altura de los niveles.`;
  else aviso.textContent = `${m.largo} × ${m.ancho}${m.alto === null ? " (alto sin dato: lo confirma el operador)" : ` × ${m.alto}`} pulgadas.`;
}

function ponerUbicacion(ubicacion) {
  const u = parsearUbicacion(ubicacion);
  campo("rack-letra").value = u ? u.rack : "";
  campo("rack-posicion").value = u ? u.posicion : "";
  campo("rack-nivel").value = u ? u.nivel : "";
}

function ubicacionElegida() {
  const rack = campo("rack-letra").value;
  const posicion = campo("rack-posicion").value;
  const nivel = campo("rack-nivel").value;
  return rack && posicion && nivel !== "" ? idUbicacion(rack, posicion, nivel) : "";
}

// Si el operador cambia el rack a mano, la recomendación ya no sobrescribe su elección.
let ubicacionManual = false;
let consultaRecomendacion = 0;
const TEXTO_FALTAN_DATOS = "Captura el cliente, el estándar, la tarima o caja y si se puede estibar para recibir una recomendación de rack.";

function mostrarRecomendacion(texto, ubicacion) {
  const caja = campo("recomendacion");
  caja.textContent = texto;
  if (!ubicacion) return;
  const boton = document.createElement("button");
  boton.type = "button";
  boton.textContent = "Usar recomendación";
  boton.addEventListener("click", () => {
    ponerUbicacion(ubicacion);
    ubicacionManual = false;
  });
  caja.appendChild(boton);
}

// Movimientos capturados mientras Firebase no acepta escrituras; se envían solos cuando vuelve.
const claveCola = (usuario) => `colaRegistros:${usuario.uid}`;

function leerCola(usuario) {
  try {
    return JSON.parse(localStorage.getItem(claveCola(usuario))) || [];
  } catch {
    return [];
  }
}

function guardarCola(usuario, cola) {
  localStorage.setItem(claveCola(usuario), JSON.stringify(cola));
  campo("cola-pendiente").textContent = cola.length
    ? `${cola.length} registro(s) guardados en este equipo, pendientes de enviar a Firebase. No cierres sesión ni borres los datos del navegador.`
    : "";
}

function datosDeColocacion(m) {
  return { pieza: m.folio, largo: largoDeMedidas(m.pieza.medidas), alto: altoDeMedidas(m.pieza.medidas), nivel: parsearUbicacion(m.zonaDestino)?.nivel, estibable: m.pieza.estibable === true, completa: m.pieza.masEncima === false };
}

// Aplica los registros pendientes de enviar sobre las ubicaciones leídas, para no recomendar un lugar que ya van a ocupar.
function ubicacionesConCola(base, usuario) {
  const ubicaciones = { ...base };
  leerCola(usuario).forEach(m => {
    quitarPieza(ubicaciones, m.folio, m.zonaOrigen);
    if (!parsearUbicacion(m.zonaDestino)) return;
    const datos = datosDeColocacion(m);
    const colocacion = modoDeColocacion(ubicaciones[m.zonaDestino], datos);
    if (colocacion) ubicaciones[m.zonaDestino] = colocarEnCelda(ubicaciones[m.zonaDestino], datos, colocacion);
  });
  return ubicaciones;
}

function quitarPieza(ubicaciones, pieza, zona) {
  if (!parsearUbicacion(zona) || !(zona in ubicaciones)) return;
  const nueva = retirarDeCelda(ubicaciones[zona], pieza);
  if (nueva) ubicaciones[zona] = nueva;
  else delete ubicaciones[zona];
}

// La ocupación, el movimiento y la ficha se guardan juntos, y dos operadores no pueden tomar el mismo espacio.
function guardarMovimiento(m, usuario) {
  const refFicha = doc(db, "piezas", m.folio);
  const cuando = m.capturadoEn ? Timestamp.fromMillis(m.capturadoEn) : serverTimestamp();
  return runTransaction(db, async (tx) => {
    const ficha = await tx.get(refFicha);
    const ocupacion = await tx.get(refOcupacion);
    const ubicaciones = { ...(ocupacion.data()?.ubicaciones || {}) };
    const anterior = ficha.data()?.ultimaZona;
    const esRack = Boolean(parsearUbicacion(m.zonaDestino));

    const cambios = {};
    if (parsearUbicacion(anterior) && anterior in ubicaciones) {
      const nueva = retirarDeCelda(ubicaciones[anterior], m.folio);
      if (nueva) ubicaciones[anterior] = nueva;
      else delete ubicaciones[anterior];
      cambios[anterior] = nueva ?? deleteField();
    }
    if (esRack) {
      const datos = datosDeColocacion(m);
      const colocacion = modoDeColocacion(ubicaciones[m.zonaDestino], datos);
      if (!colocacion) {
        const error = new Error("ubicacion-ocupada");
        error.ocupadaPor = piezasDeCelda(ubicaciones[m.zonaDestino]).join(", ");
        throw error;
      }
      cambios[m.zonaDestino] = colocarEnCelda(ubicaciones[m.zonaDestino], datos, colocacion);
    }
    if (Object.keys(cambios).length) tx.set(refOcupacion, { ubicaciones: cambios }, { merge: true });
    tx.set(doc(db, "registros", m.id), {
      folio: m.folio,
      op: m.pieza.op,
      estandarPieza: m.pieza.estandar,
      cliente: m.pieza.cliente,
      material: m.pieza.material,
      cantidad: m.pieza.cantidad,
      piezas: m.pieza.piezas,
      fechaFactura: m.pieza.fechaFactura,
      factura: m.pieza.factura,
      medidas: m.pieza.medidas,
      tipo: m.pieza.tipo,
      estibable: m.pieza.estibable,
      unica: m.pieza.unica,
      masEncima: m.pieza.masEncima,
      equipo: usuario.equipo,
      zonaOrigen: m.zonaOrigen,
      zonaDestino: m.zonaDestino,
      comentarios: m.comentarios,
      estado: m.estado,
      nombreOperador: usuario.nombre,
      uidOperador: usuario.uid,
      creadoEn: cuando
    });

    tx.set(refFicha, {
      folio: m.folio,
      ...m.pieza,
      equipo: usuario.equipo,
      ultimaZona: m.zonaDestino,
      actualizadoPor: usuario.nombre,
      actualizadoEn: cuando,
      ...(ficha.exists() ? {} : { primerRegistro: cuando })
    }, { merge: true });
  });
}

let enviandoCola = false;

async function enviarCola(usuario) {
  if (enviandoCola) return;
  enviandoCola = true;
  try {
    for (const movimiento of leerCola(usuario)) {
      try {
        await guardarMovimiento(movimiento, usuario);
      } catch (error) {
        if (error.message !== "ubicacion-ocupada") {
          if (!esFallaTemporal(error)) console.error("No se pudo enviar el registro pendiente:", error);
          break;
        }
        mostrarMensaje(`El registro pendiente de la pieza ${movimiento.folio} no se guardó: ${movimiento.zonaDestino} ya no tiene espacio (ocupada por ${error.ocupadaPor}). Captúralo de nuevo.`, "error");
      }
      guardarCola(usuario, leerCola(usuario).filter(m => m.id !== movimiento.id));
    }
  } finally {
    enviandoCola = false;
    guardarCola(usuario, leerCola(usuario));
  }
}

function iniciarRecomendaciones(usuario) {
  let pesosVigentes = null;
  let frecuencia = null;
  let recalculoPospuesto = false;

  // El primer operador que lo necesita en un periodo nuevo recalcula los pesos; los demás ya los encuentran al día.
  async function obtenerPesos() {
    if (pesosVigentes && (recalculoPospuesto || pesosVigentes.periodo === periodoDe(frecuencia))) return pesosVigentes;

    const [ajustes, actuales] = await Promise.all([leerDocumento(refAjustes), leerDocumento(refPesos)]);
    frecuencia = ajustes.data()?.frecuencia || FRECUENCIA_DEFAULT;
    const periodo = periodoDe(frecuencia);
    if (actuales.exists() && actuales.data().periodo === periodo) {
      pesosVigentes = actuales.data();
      return pesosVigentes;
    }

    try {
      const piezas = await leerColeccion(collection(db, "piezas"));
      // Con datos parciales del equipo no se recalcula: se siguen usando los últimos pesos.
      if (piezas.metadata.fromCache) throw new Error("Sin datos completos para recalcular");
      const pesos = calcularPesos(piezas.docs.map(d => {
        const p = d.data();
        return { cliente: p.cliente, estandar: p.estandar ?? p.nombre, fecha: (p.primerRegistro ?? p.actualizadoEn)?.toDate() ?? null };
      }));
      const nuevos = { ...pesos, periodo, frecuencia };
      await setDoc(refPesos, { ...nuevos, calculadoEn: serverTimestamp(), calculadoPor: usuario.nombre });
      pesosVigentes = nuevos;
    } catch (error) {
      console.warn("No se pudieron recalcular los pesos:", error);
      recalculoPospuesto = true;
      pesosVigentes = actuales.data() || { clientes: {}, estandares: {}, periodo: null };
    }
    return pesosVigentes;
  }

  return async function actualizarRecomendacion() {
    actualizarNiveles();
    const cliente = campo("cliente").value.trim();
    const estandar = campo("estandar-pieza").value.trim();
    const medidas = medidasCapturadas();
    const estiba = estibaActual();
    if (!cliente || !estandar || !medidas || !estiba.lista) {
      consultaRecomendacion++;
      mostrarRecomendacion(TEXTO_FALTAN_DATOS);
      if (!ubicacionManual) ponerUbicacion("");
      return;
    }

    if (!cabeEnRack(medidas)) {
      consultaRecomendacion++;
      mostrarRecomendacion(`Sin recomendación de rack: la pieza pasa de ${LARGO_NIVEL} × ${ANCHO_NIVEL} pulgadas o de la altura de los niveles.`);
      if (!ubicacionManual) ponerUbicacion("");
      return;
    }

    const consulta = ++consultaRecomendacion;
    mostrarRecomendacion("Buscando la mejor ubicación...");
    try {
      const [pesos, ocupacion] = await Promise.all([obtenerPesos(), leerDocumento(refOcupacion)]);
      if (consulta !== consultaRecomendacion) return;

      const ocupadas = ubicacionesConCola(ocupacion.data()?.ubicaciones || {}, usuario);
      const r = recomendarUbicacion({
        cliente, estandar, estibable: estiba.estibable, unica: estiba.unica,
        largo: largoDeMedidas(medidas), ancho: parsearMedidas(medidas).ancho, alto: altoDeMedidas(medidas)
      }, pesos, ocupadas);
      if (!r.ubicacion) {
        mostrarRecomendacion("No hay ubicaciones con espacio para esta pieza en los niveles que le tocan por su estiba y su altura.");
        if (!ubicacionManual) ponerUbicacion("");
        return;
      }
      mostrarRecomendacion(`Recomendado: ${r.ubicacion} (cliente ${r.prioridadCliente}, estándar ${r.prioridadEstandar}${r.colocacion.modo === "encima" ? ", sobre una estiba abierta" : ""}). `, r.ubicacion);
      if (!ubicacionManual) ponerUbicacion(r.ubicacion);
    } catch (error) {
      console.error("No se pudo obtener la recomendación:", error);
      if (consulta === consultaRecomendacion) {
        mostrarRecomendacion("No se pudo obtener la recomendación. Puedes elegir el rack a mano.");
      }
    }
  };
}

// La ubicación actual de una pieza puede no estar en la lista, como un rack o una zona anterior.
function ponerOrigen(ultimaZona) {
  const select = campo("zona-origen");
  [...select.options].filter(o => o.dataset.temporal).forEach(o => o.remove());
  select.disabled = false;
  if (!ultimaZona) {
    select.selectedIndex = 0;
    return;
  }
  if (!ZONAS_ORIGEN.includes(ultimaZona)) {
    const opcion = new Option(ultimaZona, ultimaZona);
    opcion.dataset.temporal = "1";
    select.add(opcion);
  }
  select.value = ultimaZona;
  select.disabled = Boolean(parsearUbicacion(ultimaZona));
}

function zonaOrigenElegida() {
  const zona = campo("zona-origen").value;
  if (zona !== ZONA_RACK) return zona;
  const rack = campo("origen-letra").value;
  const posicion = campo("origen-posicion").value;
  const nivel = campo("origen-nivel").value;
  return rack && posicion && nivel !== "" ? idUbicacion(rack, posicion, nivel) : "";
}

function llenarDatosPieza(pieza) {
  campo("op").value = pieza.op || "";
  campo("estandar-pieza").value = pieza.estandar ?? pieza.nombre ?? "";
  campo("cliente").value = pieza.cliente || "";
  campo("material").value = pieza.material || "";
  campo("cantidad").value = pieza.cantidad ?? "";
  campo("piezas").value = pieza.piezas ?? "";
  campo("estibable").value = deBooleano(pieza.estibable);
  campo("unica").value = deBooleano(pieza.unica);
  campo("mas-encima").value = pieza.masEncima === false ? "no" : "si";
  actualizarBloquesEstiba();
  campo("fecha-factura").value = pieza.fechaFactura || "";
  campo("factura").value = pieza.factura ?? "";
  campo("tipo-medida").value = buscarMedida(pieza.tipo) ? buscarMedida(pieza.tipo).nombre : "";
  medidasHeredadas = campo("tipo-medida").value ? "" : (pieza.medidas || "");
  ponerOrigen(pieza.ultimaZona);
}

function limpiarDatosPieza() {
  ["op", "estandar-pieza", "cliente", "material", "cantidad", "piezas", "fecha-factura", "factura", "estibable", "unica", "tipo-medida"].forEach(id => { campo(id).value = ""; });
  medidasHeredadas = "";
  campo("mas-encima").value = "si";
  actualizarBloquesEstiba();
  ponerOrigen("");
}

function mostrarBloqueRack() {
  campo("bloque-rack").hidden = campo("zona-destino").value !== ZONA_RACK;
  campo("bloque-origen-rack").hidden = campo("zona-origen").value !== ZONA_RACK;
}

protegerPagina("operador").then((usuario) => {
  document.getElementById("nombre-usuario").textContent = usuario.nombre;
  configurarBotonSalir("btn-salir");

  const actualizarRecomendacion = iniciarRecomendaciones(usuario);

  enviarCola(usuario);
  setInterval(() => enviarCola(usuario), 5 * 60 * 1000);
  window.addEventListener("online", () => enviarCola(usuario));

  // Evita que los datos del folio anterior se queden en el formulario si el nuevo folio no existe.
  let datosAutollenados = false;

  async function buscarFolio() {
    const folio = normalizarFolio(campoFolio.value);
    campoFolio.value = folio;

    if (folio === "") {
      mostrarEstadoFolio("", "");
      return;
    }
    if (!folioValido(folio)) {
      mostrarEstadoFolio("La pieza no puede llevar el carácter \"/\".", "");
      return;
    }

    mostrarEstadoFolio("Buscando pieza...", "");
    try {
      const ficha = await leerDocumento(doc(db, "piezas", folio));
      if (campoFolio.value !== folio) return;

      if (ficha.exists()) {
        llenarDatosPieza(ficha.data());
        mostrarBloqueRack();
        datosAutollenados = true;
        mostrarEstadoFolio("Pieza encontrada: se cargaron sus datos. Puedes corregirlos si algo cambió.", "encontrado");
      } else {
        if (datosAutollenados) limpiarDatosPieza();
        mostrarBloqueRack();
        datosAutollenados = false;
        mostrarEstadoFolio("Pieza nueva: se creará su ficha al registrar.", "nuevo");
      }
      actualizarRecomendacion();
    } catch (error) {
      mostrarEstadoFolio("No se pudo consultar la pieza. Llena los datos a mano.", "");
    }
  }

  campoFolio.addEventListener("change", buscarFolio);
  ["cliente", "estandar-pieza", "estibable", "unica", "tipo-medida"].forEach(id => campo(id).addEventListener("change", actualizarRecomendacion));
  campo("estibable").addEventListener("change", actualizarBloquesEstiba);
  ["rack-letra", "rack-posicion", "rack-nivel"].forEach(id => campo(id).addEventListener("change", () => { ubicacionManual = true; }));
  campo("zona-destino").addEventListener("change", mostrarBloqueRack);
  campo("zona-origen").addEventListener("change", mostrarBloqueRack);
  actualizarNiveles();
  mostrarBloqueRack();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    mostrarMensaje("", "");

    if (usuario.sinPerfil) {
      mostrarMensaje("No se pudo confirmar tu perfil y equipo por ahora. Recarga la página más tarde para registrar.", "error");
      return;
    }

    const folio = normalizarFolio(campoFolio.value);
    if (!folioValido(folio)) {
      mostrarMensaje("La pieza no puede llevar el carácter \"/\".", "error");
      return;
    }

    const medidas = medidasCapturadas();

    const zonaOrigen = zonaOrigenElegida();
    if (!zonaOrigen) {
      mostrarMensaje("Elige el rack, la posición y el nivel de origen.", "error");
      return;
    }

    const esRack = campo("zona-destino").value === ZONA_RACK;
    const zonaDestino = esRack ? ubicacionElegida() : campo("zona-destino").value;
    if (esRack && !zonaDestino) {
      mostrarMensaje("Elige el rack, la posición y el nivel.", "error");
      return;
    }

    const estiba = estibaActual();
    if (esRack) {
      if (!medidas || !cabeEnRack(medidas)) {
        mostrarMensaje(`Para ubicar la pieza en un rack elige la tarima o caja; debe caber en ${LARGO_NIVEL} × ${ANCHO_NIVEL} pulgadas y en la altura de algún nivel.`, "error");
        return;
      }
      if (!estiba.lista) {
        mostrarMensaje("Indica si la pieza se puede estibar y, si no, si es una sola pieza.", "error");
        return;
      }
      if (!cabeEnNivel(medidas, Number(campo("rack-nivel").value))) {
        mostrarMensaje(`La pieza no cabe en el nivel N${campo("rack-nivel").value}: su altura máxima es ${ALTURA_NIVEL[Number(campo("rack-nivel").value)]} pulgadas.`, "error");
        return;
      }
      if (!nivelesPorEstiba(estiba).includes(Number(campo("rack-nivel").value))) {
        mostrarMensaje(`Por su estiba, la pieza solo va en los niveles ${nivelesPorEstiba(estiba).map(n => "N" + n).join(" o ")}.`, "error");
        return;
      }
    }

    const textoCantidad = campo("cantidad").value;
    const textoFactura = campo("factura").value;
    const pieza = {
      op: campo("op").value.trim(),
      estandar: campo("estandar-pieza").value.trim(),
      cliente: campo("cliente").value.trim(),
      material: campo("material").value.trim(),
      cantidad: textoCantidad === "" ? null : Number(textoCantidad),
      piezas: campo("piezas").value.trim(),
      fechaFactura: campo("fecha-factura").value,
      factura: textoFactura === "" ? null : Number(textoFactura),
      medidas,
      tipo: campo("tipo-medida").value,
      tamano: tamanoDeMedidas(medidas),
      estibable: estiba.estibable,
      unica: estiba.unica,
      masEncima: estiba.estibable ? campo("mas-encima").value !== "no" : null
    };
    const movimiento = {
      id: doc(collection(db, "registros")).id,
      folio,
      pieza,
      zonaOrigen,
      zonaDestino,
      comentarios: campo("comentarios").value.trim(),
      estado: campo("estado").value.trim(),
      capturadoEn: Date.now()
    };

    const limpiarFormulario = () => {
      form.reset();
      ponerOrigen("");
      datosAutollenados = false;
      ubicacionManual = false;
      campo("mas-encima").value = "si";
      actualizarBloquesEstiba();
      mostrarEstadoFolio("", "");
      actualizarRelojFecha();
      mostrarBloqueRack();
      actualizarRecomendacion();
    };

    try {
      await guardarMovimiento({ ...movimiento, capturadoEn: null }, usuario);
      mostrarMensaje(`Registro de la pieza ${folio} guardado en ${zonaDestino}.`, "ok");
      limpiarFormulario();
    } catch (error) {
      if (esFallaTemporal(error)) {
        guardarCola(usuario, [...leerCola(usuario), movimiento]);
        mostrarMensaje(`Firebase no aceptó el registro por ahora. La pieza ${folio} quedó guardada en este equipo y se enviará solo.`, "ok");
        limpiarFormulario();
        return;
      }
      if (error.message === "ubicacion-ocupada") {
        mostrarMensaje(`La ubicación ${zonaDestino} no tiene espacio para esta pieza (ocupada por ${error.ocupadaPor}). Elige otra.`, "error");
        ubicacionManual = false;
        actualizarRecomendacion();
        return;
      }
      console.error("Error al guardar el registro:", error);
      const detalle = error && error.code ? ` (${error.code})` : "";
      mostrarMensaje("No se pudo guardar el registro. Intenta de nuevo." + detalle, "error");
    }
  });
});

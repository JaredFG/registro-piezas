// Zonas fuera de los racks. Este es el ÚNICO lugar donde se editan.
// Las ubicaciones de rack (por ejemplo "A1-N0") se definen en optimizacion.js.

export const ZONA_RACK = "Rack";

export const ZONAS_ORIGEN = ["Externo", ZONA_RACK];

export const ZONAS_DESTINO = [ZONA_RACK, "Externo"];

export function llenarSelectZonas(idSelect, zonas) {
  const select = document.getElementById(idSelect);
  zonas.forEach(nombre => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    opcion.textContent = nombre;
    select.appendChild(opcion);
  });
}

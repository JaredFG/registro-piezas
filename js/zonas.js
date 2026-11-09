// Lista de zonas del sistema. Este es el ÚNICO lugar donde se editan.
// Puedes cambiar los nombres, quitar o agregar zonas: cada una va entre comillas y separada por coma.

export const ZONAS_ORIGEN = [
  "Manufactura",
  "Preparación embarque", "Patio embarque", "Rack 1.2", "Rack 1.3", "Rack PRECISION", "Rack A embarques", "Rack B embarques", "Rack C embarques",
  "Rack D embarques", "Rack E embarques", "Rack F embarques", "Rack G embarques", "Rack H embarques", "Rack I embarques", "Rack J embarques",
  "Rack K embarques", "Rack L embarques", "Rack M embarques"
];

export const ZONAS_DESTINO = [
  "Preparación embarque", "Patio embarque", "Rack 1.2", "Rack 1.3", "Rack PRECISION", "Rack A embarques", "Rack B embarques", "Rack C embarques",
  "Rack D embarques", "Rack E embarques", "Rack F embarques", "Rack G embarques", "Rack H embarques", "Rack I embarques", "Rack J embarques",
  "Rack K embarques", "Rack L embarques", "Rack M embarques"
];

export function llenarSelectZonas(idSelect, zonas) {
  const select = document.getElementById(idSelect);
  zonas.forEach(nombre => {
    const opcion = document.createElement("option");
    opcion.value = nombre;
    opcion.textContent = nombre;
    select.appendChild(opcion);
  });
}

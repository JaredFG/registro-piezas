// Lista de zonas del sistema. Este es el ÚNICO lugar donde se editan.
// Puedes cambiar los nombres, quitar o agregar zonas: cada una va entre comillas y separada por coma.

export const ZONAS_ORIGEN = [
  "Externo",
  "Zona A", "Zona B", "Zona C", "Zona D", "Zona E", "Zona F", "Zona G",
  "Zona H", "Zona I", "Zona J", "Zona K", "Zona L", "Zona M", "Zona N",
  "Zona O", "Zona P", "Zona Q", "Zona R", "Zona S", "Zona T", "Zona U",
  "Zona V", "Zona W", "Zona X", "Zona Y", "Zona Z"
];

export const ZONAS_DESTINO = [
  "Zona A", "Zona B", "Zona C", "Zona D", "Zona E", "Zona F", "Zona G",
  "Zona H", "Zona I", "Zona J", "Zona K", "Zona L", "Zona M", "Zona N",
  "Zona O", "Zona P", "Zona Q", "Zona R", "Zona S", "Zona T", "Zona U",
  "Zona V", "Zona W", "Zona X", "Zona Y", "Zona Z"
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

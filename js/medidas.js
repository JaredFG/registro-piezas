// Las medidas se capturan como largo, ancho y alto, y se guardan como "30x30x20".
// Si el campo queda vacío, la pieza cuenta como pendiente de medir.

export function normalizarMedidas(texto) {
  return (texto || "").trim();
}

export function medidasPendientes(texto) {
  return normalizarMedidas(texto) === "";
}

// Las medidas capturadas antes como texto libre devuelven campos vacíos.
export function separarMedidas(texto) {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(normalizarMedidas(texto));
  return m ? [m[1], m[2], m[3]] : ["", "", ""];
}

// Devuelve "" si no se capturó ninguna medida y null si están incompletas o no son mayores a cero.
export function unirMedidas(valores) {
  const limpios = valores.map(v => String(v).trim());
  if (limpios.every(v => v === "")) return "";
  if (limpios.some(v => !(Number(v) > 0))) return null;
  return limpios.map(Number).join("x");
}

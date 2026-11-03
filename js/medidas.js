// Las medidas son texto libre (por ejemplo "120x80x45" o "1.2 m x 80 cm").
// Si el campo queda vacío, la pieza cuenta como pendiente de medir; si trae cualquier texto, ya no.

export function normalizarMedidas(texto) {
  return (texto || "").trim();
}

export function medidasPendientes(texto) {
  return normalizarMedidas(texto) === "";
}

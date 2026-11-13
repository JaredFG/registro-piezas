// Tarimas y cajas que el operador puede elegir al registrar una pieza.
// Cada una trae sus medidas en pulgadas (largo, ancho y alto); alto es null cuando el nombre no lo indica.
// Cuando solo hay dos medidas se toman como largo y ancho.
export const CATALOGO = [
  { nombre: "1 CAJA 52010 61 X 61 X 38\"", largo: 61, ancho: 61, alto: 38 },
  { nombre: "1 caja 746 76x20", largo: 76, ancho: 20, alto: null },
  { nombre: "CAJA 1156 REFORZADA 67\"X67\"X16\" C/10 SEP", largo: 67, ancho: 67, alto: 16 },
  { nombre: "CAJA 1201 70\"X70\"X20\" REFORZADO C/10 SEP", largo: 70, ancho: 70, alto: 20 },
  { nombre: "CAJA 1612 74\"X74\"X20\"", largo: 74, ancho: 74, alto: 20 },
  { nombre: "CAJA 1613 69\"X69\"X20\" REFORZADO C/12 SEP", largo: 69, ancho: 69, alto: 20 },
  { nombre: "CAJA 38300 - 36\" x 36\" x 28", largo: 36, ancho: 36, alto: 28 },
  { nombre: "CAJA 49090 77.8\"X83.5\"X48\" TRIPLAY C/PIJ", largo: 77.8, ancho: 83.5, alto: 48 },
  { nombre: "CAJA 5847 - Caja Panera de Triplay 52\" x 46\" x 24\"", largo: 52, ancho: 46, alto: 24 },
  { nombre: "CAJA 5848 - Caja Panera de Triplay 71\" x 70.25\" x 24\"", largo: 71, ancho: 70.25, alto: 24 },
  { nombre: "CAJA 5851 - Caja Panera de Triplay 78\" x 72\" x 24\"", largo: 78, ancho: 72, alto: 24 },
  { nombre: "CAJA 746 72\"X72\"X13\" REFORZADA CON 12 BARROTES", largo: 72, ancho: 72, alto: 13 },
  { nombre: "CAJA OSB 3084 29X29X14\" C/2 SEP", largo: 29, ancho: 29, alto: 14 },
  { nombre: "CAJA OSB 3085 35\"X35\"X13\" OSB ARMADA", largo: 35, ancho: 35, alto: 13 },
  { nombre: "CAJA OSB 315 54X54X24 CON FOAM", largo: 54, ancho: 54, alto: 24 },
  { nombre: "CAJA OSB 316 48\"X48\"X16\"", largo: 48, ancho: 48, alto: 16 },
  { nombre: "CAJA OSB 38283 50\"X50\"X5\" CON CUADRÍCULA", largo: 50, ancho: 50, alto: 5 },
  { nombre: "CAJA OSB 38330 47\"X47\"X17\" CON SEP TRIPL", largo: 47, ancho: 47, alto: 17 },
  { nombre: "CAJA OSB 38331 33\"X33\"X22\" C/2 SEPARADOR", largo: 33, ancho: 33, alto: 22 },
  { nombre: "CAJA OSB 38408 50\"X50\"X16\"", largo: 50, ancho: 50, alto: 16 },
  { nombre: "CAJA OSB 43672 31\"X31\"X22\"", largo: 31, ancho: 31, alto: 22 },
  { nombre: "CAJA OSB 43673 31\"X31\"X16\"", largo: 31, ancho: 31, alto: 16 },
  { nombre: "CAJA OSB 43674 46\"X46\"X8\"", largo: 46, ancho: 46, alto: 8 },
  { nombre: "CAJA OSB 43675 37\"X37\"X30\"", largo: 37, ancho: 37, alto: 30 },
  { nombre: "CAJA OSB 43676 48\"X48\"X26\"", largo: 48, ancho: 48, alto: 26 },
  { nombre: "CAJA OSB 44055 35\"X35\"X20\" ARMADA", largo: 35, ancho: 35, alto: 20 },
  { nombre: "CAJA OSB 44101 42\"X42\"X25\" ARMADA", largo: 42, ancho: 42, alto: 25 },
  { nombre: "CAJA OSB 44102 39\"X39\"X17\"", largo: 39, ancho: 39, alto: 17 },
  { nombre: "CAJA OSB 44103 37\"X37\"X32\"", largo: 37, ancho: 37, alto: 32 },
  { nombre: "CAJA OSB 44156 39\"X39\"X24\"", largo: 39, ancho: 39, alto: 24 },
  { nombre: "CAJA OSB 506 38\"X38\"X12\"", largo: 38, ancho: 38, alto: 12 },
  { nombre: "CAJA OSB 621 37\"X37\"X20\"", largo: 37, ancho: 37, alto: 20 },
  { nombre: "CAJA REF 1159 72\"X72\"X22\"", largo: 72, ancho: 72, alto: 22 },
  { nombre: "CAJA REF 1200 67\"X67\"X12\" C/4 SEP", largo: 67, ancho: 67, alto: 12 },
  { nombre: "CAJA REFORZADA 745 76\"x76\"x13\" C/20 SEPA", largo: 76, ancho: 76, alto: 13 },
  { nombre: "CAJA REFORZADA 746 72\"x72\"x13\" C/20 SEP", largo: 72, ancho: 72, alto: 13 },
  { nombre: "HUACAL 1092 28\"X28\"X30\"", largo: 28, ancho: 28, alto: 30 },
  { nombre: "HUACAL 51206 126\"X126\"X44\" ESTRUCTURA CO", largo: 126, ancho: 126, alto: 44 },
  { nombre: "TARIMA 50\"X50\" EURO ALTURA DE 4\" SIN ARR", largo: 50, ancho: 50, alto: 4 },
  { nombre: "TARIMA 93\"X93\" EURO", largo: 93, ancho: 93, alto: null },
  { nombre: "TARIMA EUROPALLET 100\"X100\"", largo: 100, ancho: 100, alto: null },
  { nombre: "TARIMA EUROPALLET 120\"X120\"", largo: 120, ancho: 120, alto: null },
  { nombre: "TARIMA EUROPALLET 55\"X55\"", largo: 55, ancho: 55, alto: null },
  { nombre: "TARIMA EUROPALLET 60\"X60\"", largo: 60, ancho: 60, alto: null },
  { nombre: "TARIMA EUROPALLET 65\"X65\"", largo: 65, ancho: 65, alto: null },
  { nombre: "TARIMA EUROPALLET 72\"X72\"", largo: 72, ancho: 72, alto: null },
  { nombre: "TARIMA EUROPALLET 84\"X84\"", largo: 84, ancho: 84, alto: null },
  { nombre: "TARIMA EUROPALLET 86\"X86\"", largo: 86, ancho: 86, alto: null },
  { nombre: "TARIMA EUROPALLET 96\"X96\"", largo: 96, ancho: 96, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 20\"X20\"", largo: 20, ancho: 20, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 24\"X24\"", largo: 24, ancho: 24, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 30\"X30\"", largo: 30, ancho: 30, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 36\"X36\"", largo: 36, ancho: 36, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 42\"X42\"", largo: 42, ancho: 42, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 45\"X45\"", largo: 45, ancho: 45, alto: null },
  { nombre: "TARIMA EUROPALLET-A1 48\"X48\"", largo: 48, ancho: 48, alto: null },
];

const sinAcentos = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function buscarMedida(nombre) {
  const clave = sinAcentos(nombre || "");
  return clave ? CATALOGO.find(m => sinAcentos(m.nombre) === clave) || null : null;
}

// Medidas internas en formato "largoxancho" o "largoxanchoxalto".
export function medidasDeCatalogo(opcion) {
  return opcion ? [opcion.largo, opcion.ancho, opcion.alto].filter(v => v !== null).join("x") : "";
}

// Altura de la pieza más alta del catálogo: es el límite del nivel N5, que no tiene techo definido.
export const ALTURA_MAXIMA_CATALOGO = Math.max(...CATALOGO.map(m => m.alto ?? 0));

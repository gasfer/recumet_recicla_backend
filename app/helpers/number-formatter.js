
const { getDecimalPlaces } = require('./decimals-value');

const normalizeScale = (scale) => {
  if (!Number.isInteger(scale) || scale < 0 || scale > 4) {
    throw new TypeError('La precisión decimal debe ser un entero entre 0 y 4.');
  }
  return scale;
};

const toScaledInteger = (value, scale = getDecimalPlaces()) => {
  normalizeScale(scale);
  const source = String(value ?? 0).trim();
  const raw = source.includes(',') ? source.replace(/\./g, '').replace(',', '.') : source;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new TypeError('El valor decimal no es válido.');
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  const base = 10n ** BigInt(scale);
  let scaled = BigInt(whole) * base + BigInt(fraction.slice(0, scale).padEnd(scale, '0') || '0');
  if (fraction.charAt(scale) >= '5') scaled += 1n;
  return negative ? -scaled : scaled;
};

const decimalToNumber = (value, scale = getDecimalPlaces()) => Number(toScaledInteger(value, scale)) / (10 ** scale);
const decimalToString = (value, scale = getDecimalPlaces()) => {
  const scaled = toScaledInteger(value, scale); const negative = scaled < 0n ? '-' : '';
  const raw = (scaled < 0n ? -scaled : scaled).toString().padStart(scale + 1, '0');
  return scale === 0 ? `${negative}${raw}` : `${negative}${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
};


const formattedDecimalSetter = (value) => {
    const decimalPlaces = getDecimalPlaces();
    return decimalToNumber(value, decimalPlaces);
};

const formattedDecimalQuantitySetter = (value) => {
  return decimalToNumber(value, getDecimalPlaces());
};

const decimalAdd = (left, right, scale = getDecimalPlaces()) => (
  Number(toScaledInteger(left, scale) + toScaledInteger(right, scale)) / (10 ** scale)
);

const decimalSubtract = (left, right, scale = getDecimalPlaces()) => (
  Number(toScaledInteger(left, scale) - toScaledInteger(right, scale)) / (10 ** scale)
);

const decimalCompare = (left, right, scale = getDecimalPlaces()) => {
  const difference = toScaledInteger(left, scale) - toScaledInteger(right, scale);
  return difference === 0n ? 0 : (difference > 0n ? 1 : -1);
};

const divideAndRoundHalfUp = (numerator, denominator) => {
  if (denominator === 0n) throw new RangeError('No se puede dividir entre cero.');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const dividend = numerator < 0n ? -numerator : numerator;
  const divisor = denominator < 0n ? -denominator : denominator;
  let quotient = dividend / divisor;
  if ((dividend % divisor) * 2n >= divisor) quotient += 1n;
  return negative ? -quotient : quotient;
};

const decimalMultiply = (left, right, scale = getDecimalPlaces()) => {
  const normalizedScale = normalizeScale(scale);
  const base = 10n ** BigInt(normalizedScale);
  return Number(divideAndRoundHalfUp(toScaledInteger(left, normalizedScale) * toScaledInteger(right, normalizedScale), base)) / (10 ** normalizedScale);
};

const decimalDivide = (left, right, scale = getDecimalPlaces()) => {
  const normalizedScale = normalizeScale(scale);
  const base = 10n ** BigInt(normalizedScale);
  return Number(divideAndRoundHalfUp(toScaledInteger(left, normalizedScale) * base, toScaledInteger(right, normalizedScale))) / (10 ** normalizedScale);
};

const decimalTolerance = (scale = getDecimalPlaces()) => 1 / (10 ** normalizeScale(scale));

const formatDecimalEsBo = (value, scale = getDecimalPlaces()) => new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: normalizeScale(scale),
  maximumFractionDigits: normalizeScale(scale),
}).format(decimalToNumber(value, scale));

const excelNumberMask = (scale = getDecimalPlaces()) => {
  const normalizedScale = normalizeScale(scale);
  return normalizedScale === 0 ? '#,##0' : `#,##0.${'0'.repeat(normalizedScale)}`;
};

module.exports = {
    formattedDecimalSetter,
    formattedDecimalQuantitySetter,
    decimalToNumber,
    decimalToString,
    decimalAdd,
    decimalSubtract,
    decimalCompare,
    decimalMultiply,
    decimalDivide,
    decimalTolerance,
    formatDecimalEsBo,
    excelNumberMask,
    toScaledInteger,
}

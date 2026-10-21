
const { getDecimalPlaces } = require('./decimals-value');
const { getDecimalPolicy } = require('./decimal-operation-context');
const calculationScale = () => getDecimalPolicy()?.inventory ? 4 : getDecimalPlaces();

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
    const decimalPlaces = calculationScale();
    if (getDecimalPolicy()?.inventory) return decimalToString(value, decimalPlaces);
    return decimalToNumber(value, decimalPlaces);
};

const formattedDecimalQuantitySetter = (value) => {
  if (getDecimalPolicy()?.inventory) return decimalToString(value, calculationScale());
  return decimalToNumber(value, calculationScale());
};

const decimalAdd = (left, right, scale = calculationScale()) => (
  Number(toScaledInteger(left, scale) + toScaledInteger(right, scale)) / (10 ** scale)
);

const decimalSubtract = (left, right, scale = calculationScale()) => (
  Number(toScaledInteger(left, scale) - toScaledInteger(right, scale)) / (10 ** scale)
);

const decimalCompare = (left, right, scale = calculationScale()) => {
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

const scaledToString = (scaled, scale = 4) => {
  const negative = scaled < 0n ? '-' : '';
  const raw = (scaled < 0n ? -scaled : scaled).toString().padStart(scale + 1, '0');
  return scale === 0 ? `${negative}${raw}` : `${negative}${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
};
const parseExact = (value) => {
  const source = String(value ?? 0).trim();
  const raw = source.includes(',') ? source.replace(/\./g, '').replace(',', '.') : source;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new TypeError('El valor decimal exacto no es válido.');
  const fraction = match[3] || '';
  return { units: BigInt(`${match[1]}${match[2]}${fraction}`), scale: fraction.length };
};
const exactOperands = (left, right) => {
  const first = parseExact(left); const second = parseExact(right);
  const scale = Math.max(4, first.scale, second.scale);
  return { left: first.units * 10n ** BigInt(scale - first.scale), right: second.units * 10n ** BigInt(scale - second.scale), scale };
};
const exactAdd = (left, right) => { const values = exactOperands(left, right); return scaledToString(values.left + values.right, values.scale); };
const exactSubtract = (left, right) => { const values = exactOperands(left, right); return scaledToString(values.left - values.right, values.scale); };
const exactCompare = (left, right) => { const values = exactOperands(left, right); return values.left === values.right ? 0 : values.left > values.right ? 1 : -1; };
const exactMultiply = (left, right) => { const first = parseExact(left); const second = parseExact(right); return scaledToString(first.units * second.units, first.scale + second.scale); };
const exactDivide = (left, right, scale = 4) => {
  normalizeScale(scale);
  const first = parseExact(left); const second = parseExact(right);
  if (second.units === 0n) throw new RangeError('No se puede dividir entre cero.');
  const numerator = first.units * 10n ** BigInt(second.scale + scale);
  const denominator = second.units * 10n ** BigInt(first.scale);
  return scaledToString(divideAndRoundHalfUp(numerator, denominator), scale);
};
const exactMin = (left, right) => exactAdd(exactCompare(left, right) <= 0 ? left : right, 0);
const exactMax = (left, right) => exactAdd(exactCompare(left, right) >= 0 ? left : right, 0);
const exactAbs = (value) => exactCompare(value, 0) < 0 ? exactSubtract(0, value) : exactAdd(value, 0);
const exactCeil = (value, scale = getDecimalPlaces()) => {
  normalizeScale(scale);
  const parsed = parseExact(value);
  if (parsed.scale <= scale) return scaledToString(parsed.units * 10n ** BigInt(scale - parsed.scale), scale);
  const divisor = 10n ** BigInt(parsed.scale - scale);
  let units = parsed.units / divisor;
  if (parsed.units % divisor > 0n) units += 1n;
  return scaledToString(units, scale);
};
const inventoryQuantity = (value) => decimalToString(value, getDecimalPlaces());

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
    exactAdd,
    exactSubtract,
    exactCompare,
    exactCeil,
    inventoryQuantity,
    exactMin, exactMax, exactAbs,
    exactMultiply, exactDivide,
}

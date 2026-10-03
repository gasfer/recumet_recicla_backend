'use strict';

const { getDecimalPlaces } = require('../helpers/decimals-value');
const { decimalAdd, decimalDivide, decimalMultiply, decimalSubtract, decimalToNumber, exactAdd, exactSubtract, exactCompare } = require('../helpers/number-formatter');

const round = (value, scale = getDecimalPlaces()) => decimalToNumber(value, scale);

const valueOf = (quantity, unitCost) => decimalMultiply(quantity, unitCost);

const applyEntry = ({ quantityBefore, valueBefore, quantity, unitCost }) => {
  if (unitCost === null || unitCost === undefined || !Number.isFinite(Number(unitCost))) {
    const error = new Error('No existe una base de costo válida para registrar la entrada.');
    error.code = 'VALUED_KARDEX_COST_BASIS_MISSING';
    throw error;
  }
  const quantityAfter = exactAdd(quantityBefore, quantity);
  const valueAfter = decimalAdd(valueBefore, valueOf(quantity, unitCost));
  const averageAfter = exactCompare(quantityAfter, 0) === 0 ? null : decimalDivide(valueAfter, quantityAfter);
  return { quantityAfter, valueAfter, averageAfter, appliedUnitCost: round(unitCost) };
};

const applyOutput = ({ quantityBefore, valueBefore, quantity, averageBefore, appliedUnitCost = averageBefore }) => {
  if (appliedUnitCost === null || appliedUnitCost === undefined) {
    const error = new Error('No existe una base de costo válida para registrar la salida.');
    error.code = 'VALUED_KARDEX_COST_BASIS_MISSING';
    throw error;
  }
  const quantityAfter = exactSubtract(quantityBefore, quantity);
  const outputValue = valueOf(quantity, appliedUnitCost);
  const valueAfter = exactCompare(quantityAfter, 0) === 0 ? 0 : decimalSubtract(valueBefore, outputValue);
  return {
    quantityAfter,
    valueAfter,
    averageAfter: exactCompare(quantityAfter, 0) === 0 ? null : decimalDivide(valueAfter, quantityAfter),
    appliedUnitCost: round(appliedUnitCost),
    outputValue,
  };
};

const allocateByQuantity = (totalValue, items) => {
  const totalQuantity = items.reduce((sum, item) => exactAdd(sum, item.quantity), '0.0000');
  if (exactCompare(totalQuantity, 0) <= 0) throw new Error('La cantidad total resultante debe ser mayor a cero.');
  let allocated = 0;
  return items.map((item, index) => {
    const value = index === items.length - 1
      ? decimalSubtract(totalValue, allocated)
      : decimalDivide(decimalMultiply(totalValue, item.quantity), totalQuantity);
    allocated = decimalAdd(allocated, value);
    return { ...item, allocatedValue: value, unitCost: decimalDivide(value, item.quantity) };
  });
};

module.exports = { allocateByQuantity, applyEntry, applyOutput, round, valueOf };

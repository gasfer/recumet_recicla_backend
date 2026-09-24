'use strict';

const { MONEY_SCALE } = require('./valued-kardex-contract.service');

const round = (value, scale = MONEY_SCALE) => {
  if (!Number.isFinite(Number(value))) throw new TypeError('El valor decimal no es válido.');
  const factor = 10 ** scale;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const valueOf = (quantity, unitCost) => round(Number(quantity) * Number(unitCost));

const applyEntry = ({ quantityBefore, valueBefore, quantity, unitCost }) => {
  if (unitCost === null || unitCost === undefined || !Number.isFinite(Number(unitCost))) {
    const error = new Error('No existe una base de costo válida para registrar la entrada.');
    error.code = 'VALUED_KARDEX_COST_BASIS_MISSING';
    throw error;
  }
  const quantityAfter = round(Number(quantityBefore) + Number(quantity));
  const valueAfter = round(Number(valueBefore) + valueOf(quantity, unitCost));
  const averageAfter = quantityAfter === 0 ? null : round(valueAfter / quantityAfter);
  return { quantityAfter, valueAfter, averageAfter, appliedUnitCost: round(unitCost) };
};

const applyOutput = ({ quantityBefore, valueBefore, quantity, averageBefore, appliedUnitCost = averageBefore }) => {
  if (appliedUnitCost === null || appliedUnitCost === undefined) {
    const error = new Error('No existe una base de costo válida para registrar la salida.');
    error.code = 'VALUED_KARDEX_COST_BASIS_MISSING';
    throw error;
  }
  const quantityAfter = round(Number(quantityBefore) - Number(quantity));
  const outputValue = valueOf(quantity, appliedUnitCost);
  const valueAfter = quantityAfter === 0 ? 0 : round(Number(valueBefore) - outputValue);
  return {
    quantityAfter,
    valueAfter,
    averageAfter: quantityAfter === 0 ? null : round(valueAfter / quantityAfter),
    appliedUnitCost: round(appliedUnitCost),
    outputValue,
  };
};

const allocateByQuantity = (totalValue, items) => {
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  if (!(totalQuantity > 0)) throw new Error('La cantidad total resultante debe ser mayor a cero.');
  let allocated = 0;
  return items.map((item, index) => {
    const value = index === items.length - 1
      ? round(Number(totalValue) - allocated)
      : round(Number(totalValue) * Number(item.quantity) / totalQuantity);
    allocated = round(allocated + value);
    return { ...item, allocatedValue: value, unitCost: round(value / Number(item.quantity)) };
  });
};

module.exports = { allocateByQuantity, applyEntry, applyOutput, round, valueOf };

'use strict';

const {
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
} = require('../constants/stock-reconciliation');
const { decimalSubtract, decimalTolerance } = require('../helpers/number-formatter');

const getEpsilon = () => decimalTolerance();
const executableStrategies = new Set([
  STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT,
  STRATEGIES.REGISTER_MISSING_KARDEX,
  STRATEGIES.ADJUST_STOCK_BY_COUNT,
  STRATEGIES.LINK_EXISTING,
]);

const closeEnough = (first, second) => Math.abs(decimalSubtract(first, second)) <= getEpsilon();

const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  DETECTADA: Object.freeze(['EN_INVESTIGACION', 'LISTA_PARA_REGULARIZAR']),
  EN_INVESTIGACION: Object.freeze(['EN_INVESTIGACION', 'LISTA_PARA_REGULARIZAR']),
  LISTA_PARA_REGULARIZAR: Object.freeze(['EN_INVESTIGACION', 'LISTA_PARA_REGULARIZAR', 'RESUELTA']),
  RESUELTA: Object.freeze([]),
});

const assertStatusTransition = (currentStatus, nextStatus) => {
  if (!(ALLOWED_STATUS_TRANSITIONS[currentStatus] || []).includes(nextStatus)) {
    const error = new Error(`No se permite cambiar el caso de ${currentStatus} a ${nextStatus}.`);
    error.statusCode = 409;
    throw error;
  }
};

const investigationErrors = ({ physicalCount, cause, notes, strategy, assignedUserId, evidences = [], sourceReferenceCode }) => {
  if (!Object.values(STRATEGIES).includes(strategy)) return ['Seleccione una acción de diagnóstico válida.'];
  if (strategy === STRATEGIES.CONTINUE_INVESTIGATION) {
    return String(notes || '').trim().length >= 10 ? [] : ['Describa el seguimiento realizado (mínimo 10 caracteres).'];
  }
  const errors = [];
  if (physicalCount === null || physicalCount === undefined || physicalCount === ''
    || !Number.isFinite(Number(physicalCount)) || Number(physicalCount) < 0) {
    errors.push('Registre un conteo físico válido.');
  }
  if (String(cause || '').trim().length < 5) errors.push('Registre una causa de al menos 5 caracteres.');
  if (!Number(assignedUserId)) errors.push('Asigne un responsable.');
  if (!Array.isArray(evidences) || evidences.length === 0) errors.push('Adjunte al menos una evidencia o referencia verificable.');
  if (strategy === STRATEGIES.REGISTER_MISSING_KARDEX && String(sourceReferenceCode || '').trim().length < 3) {
    errors.push('Indique el documento fuente del movimiento Kardex omitido.');
  }
  return errors;
};

const buildPreview = ({ strategy, stock, kardex, physicalCount, sourceReferenceCode }) => {
  const physicalStock = Number(stock);
  const kardexBalance = Number(kardex);
  const difference = decimalSubtract(physicalStock, kardexBalance);
  if (!executableStrategies.has(strategy)) {
    const error = new Error('La acción seleccionada sólo registra seguimiento y no puede regularizar saldos.');
    error.statusCode = 422;
    throw error;
  }
  if (strategy === STRATEGIES.REGISTER_MISSING_KARDEX && !closeEnough(physicalCount, physicalStock)) {
    const error = new Error('El conteo físico debe confirmar el Stock antes de registrar un movimiento Kardex omitido.');
    error.statusCode = 422;
    throw error;
  }
  if (strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT && !closeEnough(physicalCount, kardexBalance)) {
    const error = new Error('El conteo físico debe confirmar el saldo Kardex antes de ajustar Stock.');
    error.statusCode = 422;
    throw error;
  }
  const preview = {
    strategy,
    stock_before: physicalStock,
    kardex_before: kardexBalance,
    difference_before: difference,
    stock_after: physicalStock,
    kardex_after: kardexBalance,
    difference_after: difference,
    source_reference_code: sourceReferenceCode || null,
    effect_label: 'Verificar regularización existente',
    registry_number: null,
    movement: null,
    stock_adjustment: null,
  };
  if (strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) {
    const target = Number(physicalCount);
    preview.stock_after = target;
    preview.kardex_after = target;
    preview.difference_after = 0;
    const stockDelta = decimalSubtract(target, physicalStock);
    const delta = decimalSubtract(target, kardexBalance);
    preview.stock_adjustment = Math.abs(stockDelta) <= getEpsilon() ? null : {
      type: stockDelta > 0 ? 'INCREASE' : 'DECREASE', quantity: Math.abs(stockDelta),
    };
    preview.effect_label = delta > getEpsilon() ? 'Ingreso Kardex por ajuste físico' : delta < -getEpsilon() ? 'Egreso Kardex por ajuste físico' : 'Ajuste físico sin movimiento Kardex';
    preview.movement = Math.abs(delta) <= getEpsilon() ? null : { type: delta > 0 ? 'INPUT' : 'OUTPUT', quantity: Math.abs(delta) };
  } else if (strategy === STRATEGIES.REGISTER_MISSING_KARDEX) {
    preview.kardex_after = physicalStock;
    preview.difference_after = 0;
    preview.effect_label = `${difference >= 0 ? 'Registrar entrada' : 'Registrar salida'} Kardex`;
    preview.movement = { type: difference >= 0 ? 'INPUT' : 'OUTPUT', quantity: Math.abs(difference) };
  } else if (strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT) {
    preview.stock_after = kardexBalance;
    preview.difference_after = 0;
    const stockDelta = decimalSubtract(kardexBalance, physicalStock);
    preview.stock_adjustment = Math.abs(stockDelta) <= getEpsilon() ? null : {
      type: stockDelta > 0 ? 'INCREASE' : 'DECREASE', quantity: Math.abs(stockDelta),
    };
    preview.effect_label = 'Ajustar Stock según conteo físico';
  }
  return preview;
};

module.exports = {
  getEpsilon,
  ALLOWED_STATUS_TRANSITIONS,
  executableStrategies,
  investigationErrors,
  buildPreview,
  closeEnough,
  assertStatusTransition,
};

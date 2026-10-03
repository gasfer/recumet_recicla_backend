'use strict';

const {
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
} = require('../constants/stock-reconciliation');
const { exactSubtract, exactAdd, exactAbs, exactCompare } = require('../helpers/number-formatter');

const getEpsilon = () => 0;
const executableStrategies = new Set([
  STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT,
  STRATEGIES.REGISTER_MISSING_KARDEX,
  STRATEGIES.ADJUST_STOCK_BY_COUNT,
  STRATEGIES.LINK_EXISTING,
]);

const closeEnough = (first, second) => exactCompare(first, second) === 0;

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
  const physicalStock = exactAdd(stock, 0); const kardexBalance = exactAdd(kardex, 0);
  const difference = exactSubtract(physicalStock, kardexBalance);
  if (!executableStrategies.has(strategy)) throw Object.assign(new Error('La acción seleccionada sólo registra seguimiento y no puede regularizar saldos.'), { statusCode: 422 });
  if (strategy === STRATEGIES.REGISTER_MISSING_KARDEX && !closeEnough(physicalCount, physicalStock)) throw Object.assign(new Error('El conteo físico debe confirmar el Stock antes de registrar un movimiento Kardex omitido.'), { statusCode: 422 });
  if (strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT && !closeEnough(physicalCount, kardexBalance)) throw Object.assign(new Error('El conteo físico debe confirmar el saldo Kardex antes de ajustar Stock.'), { statusCode: 422 });
  const preview = { strategy, stock_before: physicalStock, kardex_before: kardexBalance, difference_before: difference, stock_after: physicalStock, kardex_after: kardexBalance, difference_after: strategy === STRATEGIES.LINK_EXISTING ? difference : '0.0000', source_reference_code: sourceReferenceCode || null, effect_label: 'Verificar regularización existente', registry_number: null, movement: null, stock_adjustment: null };
  if (strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) {
    const target = exactAdd(physicalCount, 0); preview.stock_after = target; preview.kardex_after = target;
    const stockDelta = exactSubtract(target, physicalStock); const delta = exactSubtract(target, kardexBalance);
    preview.stock_adjustment = exactCompare(stockDelta, 0) === 0 ? null : { type: exactCompare(stockDelta, 0) > 0 ? 'INCREASE' : 'DECREASE', quantity: exactAbs(stockDelta) };
    preview.effect_label = exactCompare(delta, 0) > 0 ? 'Ingreso Kardex por ajuste físico' : exactCompare(delta, 0) < 0 ? 'Egreso Kardex por ajuste físico' : 'Ajuste físico sin movimiento Kardex';
    preview.movement = exactCompare(delta, 0) === 0 ? null : { type: exactCompare(delta, 0) > 0 ? 'INPUT' : 'OUTPUT', quantity: exactAbs(delta) };
  } else if (strategy === STRATEGIES.REGISTER_MISSING_KARDEX) {
    preview.kardex_after = physicalStock; preview.effect_label = exactCompare(difference, 0) >= 0 ? 'Registrar entrada Kardex' : 'Registrar salida Kardex';
    preview.movement = { type: exactCompare(difference, 0) >= 0 ? 'INPUT' : 'OUTPUT', quantity: exactAbs(difference) };
  } else if (strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT) {
    preview.stock_after = kardexBalance; const stockDelta = exactSubtract(kardexBalance, physicalStock);
    preview.stock_adjustment = exactCompare(stockDelta, 0) === 0 ? null : { type: exactCompare(stockDelta, 0) > 0 ? 'INCREASE' : 'DECREASE', quantity: exactAbs(stockDelta) };
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

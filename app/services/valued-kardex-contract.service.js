'use strict';

const VALUATION_STATUS = Object.freeze({
  VALUED: 'VALUED',
  UNVALUED: 'UNVALUED',
});

const QUANTITY_SCALE = 4;
const MONEY_SCALE = 4;

const SOURCE_CONTRACTS = Object.freeze({
  INPUT: Object.freeze({ direction: 'INPUT', costField: 'details_inputs.cost', actorField: 'inputs.id_user', sequence: 10 }),
  TRANSFER_SENT: Object.freeze({ direction: 'OUTPUT', costField: 'details_transfers.cost', actorField: 'transfers.id_user_send', sequence: 20 }),
  TRANSFER_RECEIVED: Object.freeze({ direction: 'INPUT', costField: 'details_transfers.cost', actorField: 'transfers.id_user_received', sequence: 30 }),
  CLASSIFICATION_OUTPUT: Object.freeze({ direction: 'OUTPUT', costField: 'classifieds.cost_product', actorField: 'classifieds.id_user', sequence: 40 }),
  CLASSIFICATION_INPUT: Object.freeze({ direction: 'INPUT', costField: 'details_classifieds.cost', actorField: 'classifieds.id_user', sequence: 50 }),
  OUTPUT: Object.freeze({ direction: 'OUTPUT', costField: 'details_outputs.cost', actorField: 'outputs.id_user', sequence: 60 }),
  RECONCILIATION: Object.freeze({ direction: 'DYNAMIC', costField: 'kardex_movements.cost', actorField: 'kardex_movements.id_user', sequence: 70 }),
  ADJUSTMENT: Object.freeze({ direction: 'DYNAMIC', costField: 'kardex_movements.cost', actorField: 'kardex_movements.id_user', sequence: 80 }),
  REVERSAL: Object.freeze({ direction: 'DYNAMIC', costField: 'kardex_movements.cost', actorField: 'kardex_movements.id_user', sequence: 90 }),
});

const classifySource = ({ type, type_movement, event_type } = {}) => {
  if (event_type === 'REVERSAL') return 'REVERSAL';
  if (event_type === 'RECONCILIATION') return 'RECONCILIATION';
  if (event_type === 'PHYSICAL_ADJUSTMENT' || type_movement === 'KMOVEMENT') return 'ADJUSTMENT';
  if (type_movement === 'TRANSFER') return type === 'INPUT' ? 'TRANSFER_RECEIVED' : 'TRANSFER_SENT';
  if (type_movement === 'CLASIFIED') return type === 'INPUT' ? 'CLASSIFICATION_INPUT' : 'CLASSIFICATION_OUTPUT';
  if (type_movement === 'INPUT') return 'INPUT';
  if (type_movement === 'OUTPUT') return 'OUTPUT';
  return 'ADJUSTMENT';
};

const stableMovementKey = (movement = {}) => {
  const source = classifySource(movement);
  const sequence = SOURCE_CONTRACTS[source].sequence;
  const date = new Date(movement.date || 0).toISOString();
  const movementId = String(movement.id_movement ?? '').padStart(20, '0');
  const detailId = String(movement.source_detail_id ?? movement.id ?? '').padStart(20, '0');
  return `${date}|${String(sequence).padStart(3, '0')}|${movementId}|${detailId}`;
};

const nullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const buildValuedKardexDto = (row = {}) => {
  const appliedCost = nullableNumber(row.applied_unit_cost ?? row.cost_unitario);
  const averageCost = nullableNumber(row.average_unit_cost_after);
  const balanceValue = nullableNumber(row.balance_value_after ?? row.cost_saldo);
  const explicitStatus = row.valuation_status;
  const valuationStatus = explicitStatus || (
    appliedCost !== null && averageCost !== null && balanceValue !== null
      ? VALUATION_STATUS.VALUED
      : VALUATION_STATUS.UNVALUED
  );

  return {
    ...row,
    valuation: {
      status: valuationStatus,
      reason: valuationStatus === VALUATION_STATUS.UNVALUED
        ? (row.valuation_reason || 'No existe una base de costo histórica determinable.')
        : null,
      applied_unit_cost: appliedCost,
      input_value: nullableNumber(row.input_value ?? row.cost_input),
      output_value: nullableNumber(row.output_value ?? row.cost_output),
      average_unit_cost_after: averageCost,
      balance_value_after: balanceValue,
    },
    responsible: row.responsible_id == null ? null : {
      id: Number(row.responsible_id),
      name: row.responsible_name || null,
    },
    original_movement: row.original_movement_id == null ? null : {
      id: Number(row.original_movement_id),
      reference: row.original_reference || null,
    },
  };
};

module.exports = {
  MONEY_SCALE,
  QUANTITY_SCALE,
  SOURCE_CONTRACTS,
  VALUATION_STATUS,
  buildValuedKardexDto,
  classifySource,
  stableMovementKey,
};

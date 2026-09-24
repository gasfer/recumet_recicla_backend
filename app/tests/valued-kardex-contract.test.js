'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MONEY_SCALE,
  QUANTITY_SCALE,
  SOURCE_CONTRACTS,
  VALUATION_STATUS,
  buildValuedKardexDto,
  classifySource,
  stableMovementKey,
} = require('../services/valued-kardex-contract.service');
const { allocateByQuantity, applyEntry, applyOutput } = require('../services/weighted-average.service');

test('caracteriza cantidad, costo, responsable y secuencia de todos los orígenes físicos', () => {
  assert.equal(QUANTITY_SCALE, 4);
  assert.equal(MONEY_SCALE, 4);
  for (const source of [
    'INPUT', 'OUTPUT', 'TRANSFER_SENT', 'TRANSFER_RECEIVED',
    'CLASSIFICATION_OUTPUT', 'CLASSIFICATION_INPUT',
    'RECONCILIATION', 'ADJUSTMENT', 'REVERSAL',
  ]) {
    assert.ok(SOURCE_CONTRACTS[source], `Falta contrato para ${source}`);
    assert.ok(SOURCE_CONTRACTS[source].costField);
    assert.ok(SOURCE_CONTRACTS[source].actorField);
    assert.ok(Number.isInteger(SOURCE_CONTRACTS[source].sequence));
  }
});

test('clasifica las dos piernas de traslado y clasificación de manera inequívoca', () => {
  assert.equal(classifySource({ type: 'OUTPUT', type_movement: 'TRANSFER' }), 'TRANSFER_SENT');
  assert.equal(classifySource({ type: 'INPUT', type_movement: 'TRANSFER' }), 'TRANSFER_RECEIVED');
  assert.equal(classifySource({ type: 'OUTPUT', type_movement: 'CLASIFIED' }), 'CLASSIFICATION_OUTPUT');
  assert.equal(classifySource({ type: 'INPUT', type_movement: 'CLASIFIED' }), 'CLASSIFICATION_INPUT');
  assert.equal(classifySource({ type: 'INPUT', type_movement: 'KMOVEMENT', event_type: 'REVERSAL' }), 'REVERSAL');
});

test('genera un orden total estable para fecha, tipo, movimiento y detalle empatados', () => {
  const base = { date: '2026-09-15T12:00:00.000Z', id_movement: 7 };
  const sent = stableMovementKey({ ...base, type: 'OUTPUT', type_movement: 'TRANSFER', id: 2 });
  const received = stableMovementKey({ ...base, type: 'INPUT', type_movement: 'TRANSFER', id: 1 });
  assert.ok(sent < received);
  assert.equal(stableMovementKey({ ...base, type: 'INPUT', type_movement: 'TRANSFER', id: 1 }), received);
});

test('calcula promedio ponderado, salida parcial y saldo exactamente cero', () => {
  const first = applyEntry({ quantityBefore: 0, valueBefore: 0, quantity: 10, unitCost: 20 });
  const second = applyEntry({ quantityBefore: first.quantityAfter, valueBefore: first.valueAfter, quantity: 10, unitCost: 30 });
  assert.deepEqual(second, { quantityAfter: 20, valueAfter: 500, averageAfter: 25, appliedUnitCost: 30 });
  const partial = applyOutput({ quantityBefore: 20, valueBefore: 500, quantity: 4, averageBefore: 25 });
  assert.equal(partial.valueAfter, 400);
  assert.equal(partial.averageAfter, 25);
  const empty = applyOutput({ quantityBefore: 16, valueBefore: 400, quantity: 16, averageBefore: 25 });
  assert.equal(empty.quantityAfter, 0);
  assert.equal(empty.valueAfter, 0);
  assert.equal(empty.averageAfter, null);
});

test('distribuye una clasificación conservando el valor y asignando el residuo', () => {
  const allocation = allocateByQuantity(100, [{ id: 1, quantity: 6 }, { id: 2, quantity: 4 }]);
  assert.deepEqual(allocation.map(({ allocatedValue }) => allocatedValue), [60, 40]);
  const thirds = allocateByQuantity(10, [{ quantity: 1 }, { quantity: 1 }, { quantity: 1 }]);
  assert.equal(thirds.reduce((sum, item) => sum + item.allocatedValue, 0), 10);
});

test('el DTO distingue costo cero válido de valoración desconocida y no inventa responsable', () => {
  const valued = buildValuedKardexDto({
    cost_unitario: 0, cost_input: 0, cost_output: 0,
    average_unit_cost_after: 0, balance_value_after: 0,
    responsible_id: 8, responsible_name: 'Ana',
  });
  assert.equal(valued.valuation.status, VALUATION_STATUS.VALUED);
  assert.equal(valued.valuation.applied_unit_cost, 0);
  assert.deepEqual(valued.responsible, { id: 8, name: 'Ana' });

  const unknown = buildValuedKardexDto({ cost_unitario: null, cost_saldo: null });
  assert.equal(unknown.valuation.status, VALUATION_STATUS.UNVALUED);
  assert.equal(unknown.valuation.applied_unit_cost, null);
  assert.equal(unknown.responsible, null);
});

test('una salida sin base de costo devuelve un error de dominio identificable', () => {
  assert.throws(
    () => applyOutput({ quantityBefore: 4, valueBefore: 0, quantity: 1, averageBefore: null }),
    (error) => error.code === 'VALUED_KARDEX_COST_BASIS_MISSING',
  );
});

test('una entrada sin costo tampoco se convierte silenciosamente en cero', () => {
  assert.throws(
    () => applyEntry({ quantityBefore: 0, valueBefore: 0, quantity: 1, unitCost: null }),
    (error) => error.code === 'VALUED_KARDEX_COST_BASIS_MISSING',
  );
});

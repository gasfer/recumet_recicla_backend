'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValuedKardexRebuilder } = require('../services/valued-kardex-rebuilder.service');

const base = { id_product: 1, id_sucursal: 2, id_storage: 3 };

test('previsualiza cronológicamente sin modificar las filas recibidas', () => {
  const rows = [
    { ...base, id: 2, id_movement: 2, date: '2026-01-02', type: 'OUTPUT', type_movement: 'OUTPUT', quantity: 2, cost_unitario: 99, saldo: 8 },
    { ...base, id: 1, id_movement: 1, date: '2026-01-01', type: 'INPUT', type_movement: 'INPUT', quantity: 10, cost_unitario: 5, saldo: 10 },
  ];
  const snapshot = JSON.stringify(rows);
  const preview = new ValuedKardexRebuilder().preview(rows);
  assert.equal(preview.mutated, false);
  assert.equal(JSON.stringify(rows), snapshot);
  assert.deepEqual(preview.entries.map((entry) => entry.id_movement), [1, 2]);
  assert.equal(preview.entries[1].applied_unit_cost, 5);
  assert.equal(preview.entries[1].balance_value_after, 40);
});

test('reporta costo ausente y discontinuidad con documento, producto y ubicación', () => {
  const preview = new ValuedKardexRebuilder().preview([
    { ...base, id: 1, id_movement: 9, registry_number: 'DOC-9', date: '2026-01-01', type: 'OUTPUT', type_movement: 'OUTPUT', quantity: 1, saldo: -1 },
  ]);
  assert.equal(preview.entries[0].valuation_status, 'UNVALUED');
  assert.deepEqual(preview.exceptions[0], {
    code: 'VALUED_KARDEX_COST_BASIS_MISSING',
    reason: 'No existe una base de costo válida para registrar la salida.',
    registry_number: 'DOC-9', id_product: 1, id_sucursal: 2, id_storage: 3, id_movement: 9,
  });
});

test('la paridad física impide validar una combinación con diferencia', () => {
  const rebuilder = new ValuedKardexRebuilder();
  const preview = rebuilder.preview([
    { ...base, id: 1, id_movement: 1, date: '2026-01-01', type: 'INPUT', type_movement: 'INPUT', quantity: 10, cost_unitario: 5, saldo: 10 },
  ]);
  assert.deepEqual(rebuilder.comparePhysical(preview, [{ ...base, stock: 10 }]), { valid: true, differences: [] });
  const mismatch = rebuilder.comparePhysical(preview, [{ ...base, stock: 9 }]);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.differences[0].difference, -1);
});

test('aplica sólo ubicaciones valoradas y con paridad, de forma idempotente', async () => {
  const rebuilder = new ValuedKardexRebuilder();
  const valid = { id_product: 1, id_sucursal: 1, id_storage: 1 };
  const invalid = { id_product: 2, id_sucursal: 1, id_storage: 1 };
  const preview = rebuilder.preview([
    { ...valid, id: 1, id_movement: 1, date: '2026-01-01', type: 'INPUT', type_movement: 'INPUT', quantity: 10, quantity_input: 10, cost_unitario: 5, saldo: 10 },
    { ...invalid, id: 2, id_movement: 2, date: '2026-01-01', type: 'OUTPUT', type_movement: 'OUTPUT', quantity: 1, quantity_output: 1, cost_unitario: 5, saldo: -1 },
  ]);
  const parity = rebuilder.comparePhysical(preview, [
    { ...valid, stock: 10 }, { ...invalid, stock: 0 },
  ]);
  const entries = new Map();
  const balances = new Map();
  const writer = {
    upsertEntries: async (rows) => rows.forEach((row) => entries.set(`${row.source_type}:${row.source_id}:${row.source_detail_id}:${row.effect_type}`, row)),
    upsertBalances: async (rows) => rows.forEach((row) => balances.set(`${row.id_product}:${row.id_sucursal}:${row.id_storage}`, row)),
  };
  const first = await rebuilder.applyValidated({ preview, parity, writer, transaction: {} });
  const second = await rebuilder.applyValidated({ preview, parity, writer, transaction: {} });
  assert.deepEqual(first, { locations: 1, entries: 1, balances: 1 });
  assert.deepEqual(second, first);
  assert.equal(entries.size, 1);
  assert.equal(balances.size, 1);
  assert.ok(balances.has('1:1:1'));
});

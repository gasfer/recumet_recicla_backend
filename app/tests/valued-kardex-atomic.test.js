'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValuedKardexService } = require('../services/valued-kardex.service');

test('documento y valoración usan la misma transacción', async () => {
  const transaction = { id: 'shared', LOCK: { UPDATE: 'UPDATE' } };
  const seen = [];
  const repository = {
    findEntry: async () => null,
    lockBalance: async (_location, tx) => { seen.push(tx); return { quantity: 0, balance_value: 0, average_unit_cost: null }; },
    createEntry: async (values, tx) => { seen.push(tx); return { id: 9, ...values }; },
    saveBalance: async (_balance, _values, tx) => { seen.push(tx); },
  };
  const sequelize = { transaction: async (callback) => callback(transaction) };
  const service = new ValuedKardexService({ sequelize, repository });
  const result = await service.executeAtomic({
    operation: async (tx) => { seen.push(tx); return { id: 22 }; },
    movement: {
      sourceType: 'INPUT', sourceId: 22, sourceDetailId: 3, effectType: 'ORIGINAL',
      id_product: 1, id_sucursal: 2, id_storage: 3, direction: 'INPUT', quantity: 5, unitCost: 10,
    },
  });
  assert.equal(result.operationResult.id, 22);
  assert.ok(seen.every((tx) => tx === transaction));
});

test('una falla de valoración hace fallar la unidad transaccional completa', async () => {
  let committed = false;
  let rolledBack = false;
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const sequelize = {
    transaction: async (callback) => {
      try {
        const result = await callback(transaction);
        committed = true;
        return result;
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    },
  };
  const repository = {
    findEntry: async () => null,
    lockBalance: async () => ({ quantity: 4, balance_value: 0, average_unit_cost: null }),
  };
  const service = new ValuedKardexService({ sequelize, repository });
  await assert.rejects(() => service.executeAtomic({
    operation: async () => ({ documentWritten: true }),
    movement: {
      sourceType: 'OUTPUT', sourceId: 1, effectType: 'ORIGINAL',
      id_product: 1, id_sucursal: 1, id_storage: 1, direction: 'OUTPUT', quantity: 1,
    },
  }), (error) => error.code === 'VALUED_KARDEX_COST_BASIS_MISSING');
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
});

test('repetir la misma fuente devuelve la entrada existente sin duplicarla', async () => {
  const existing = { id: 77 };
  let writes = 0;
  const repository = {
    findEntry: async () => existing,
    lockBalance: async () => { writes += 1; },
  };
  const service = new ValuedKardexService({ repository });
  const result = await service.recordMovement({
    sourceType: 'INPUT', sourceId: 1, effectType: 'ORIGINAL',
    id_product: 1, id_sucursal: 1, id_storage: 1,
    direction: 'INPUT', quantity: 1, unitCost: 1, transaction: {},
  });
  assert.equal(result, existing);
  assert.equal(writes, 0);
});

test('la reversión copia el costo histórico y enlaza el movimiento original', async () => {
  let created;
  const repository = {
    findEntry: async () => null,
    lockBalance: async () => ({ quantity: 8, balance_value: 160, average_unit_cost: 20 }),
    createEntry: async (values) => { created = { id: 91, ...values }; return created; },
    saveBalance: async () => {},
  };
  const service = new ValuedKardexService({ repository });
  const original = {
    id: 44, id_product: 1, id_sucursal: 2, id_storage: 3,
    quantity_input: 4, quantity_output: 0, applied_unit_cost: 15,
  };
  const reversal = await service.recordReversal({
    originalEntry: original, sourceType: 'REVERSAL', sourceId: 'cancel-44', id_user: 7, transaction: {},
  });
  assert.equal(reversal.original_entry_id, 44);
  assert.equal(created.quantity_output, 4);
  assert.equal(created.applied_unit_cost, 15);
  assert.equal(created.output_value, 60);
});

test('la reversión de una salida registra una entrada al costo histórico, no al promedio vigente', async () => {
  let created;
  const repository = {
    findEntry: async () => null,
    lockBalance: async () => ({ quantity: 2, balance_value: 50, average_unit_cost: 25 }),
    createEntry: async (values) => { created = { id: 92, ...values }; return created; },
    saveBalance: async () => {},
  };
  const service = new ValuedKardexService({ repository });
  await service.recordReversal({
    originalEntry: {
      id: 45, id_product: 1, id_sucursal: 2, id_storage: 3,
      quantity_input: 0, quantity_output: 2, applied_unit_cost: 18,
    },
    sourceType: 'REVERSAL', sourceId: 'cancel-45', id_user: 7, transaction: {},
  });
  assert.equal(created.quantity_input, 2);
  assert.equal(created.applied_unit_cost, 18);
  assert.equal(created.input_value, 36);
  assert.equal(created.original_entry_id, 45);
});

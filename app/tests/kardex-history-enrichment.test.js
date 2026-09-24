'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichKardexHistory } = require('../services/kardex-history-enrichment.service');

test('enriquece valoración y responsables en lote por origen', async () => {
  const rows = [
    { dataValues: { id_movement: 10, id_product: 1, id_sucursal: 2, id_storage: 3, type: 'INPUT', type_movement: 'INPUT', cost_unitario: 7 } },
    { dataValues: { id_movement: 20, id_product: 1, id_sucursal: 2, id_storage: 3, type: 'OUTPUT', type_movement: 'TRANSFER', cost_unitario: 7 } },
  ];
  let userQueries = 0;
  const models = {
    ValuedKardexEntry: { findAll: async () => [
      { id: 100, source_type: 'INPUT', source_id: '10', id_product: 1, id_sucursal: 2, id_storage: 3, quantity_input: 5, quantity_output: 0, applied_unit_cost: 7, input_value: 35, output_value: 0, average_unit_cost_after: 7, balance_value_after: 35, valuation_status: 'VALUED', valuation_reason: null, original_entry_id: null },
      { id: 200, source_type: 'TRANSFER_SENT', source_id: '20', id_product: 1, id_sucursal: 2, id_storage: 3, quantity_input: 0, quantity_output: 2, applied_unit_cost: 7, input_value: 0, output_value: 14, average_unit_cost_after: 7, balance_value_after: 21, valuation_status: 'VALUED', valuation_reason: null, original_entry_id: null },
    ] },
    Input: { findAll: async () => [{ id: 10, id_user: 5 }] },
    Output: { findAll: async () => [] },
    Classified: { findAll: async () => [] },
    Transfers: { findAll: async () => [{ id: 20, id_user_send: 6, id_user_received: 7 }] },
    kardexMovements: { findAll: async () => [] },
    User: { findAll: async () => { userQueries += 1; return [{ id: 5, full_names: 'Compra Uno' }, { id: 6, full_names: 'Envía Dos' }]; } },
  };
  await enrichKardexHistory(rows, models);
  assert.equal(userQueries, 1);
  assert.equal(rows[0].dataValues.valuation.average_unit_cost_after, 7);
  assert.deepEqual(rows[0].dataValues.responsible, { id: 5, name: 'Compra Uno' });
  assert.equal(rows[1].dataValues.valuation.output_value, 14);
  assert.deepEqual(rows[1].dataValues.responsible, { id: 6, name: 'Envía Dos' });
});

test('no atribuye responsable y marca SIN VALORAR cuando no existe libro valorado', async () => {
  const rows = [{ dataValues: { id_movement: 30, id_product: 2, id_sucursal: 2, id_storage: 3, type: 'OUTPUT', type_movement: 'OUTPUT', cost_unitario: null, cost_saldo: null } }];
  const emptyModel = { findAll: async () => [] };
  const models = {
    ValuedKardexEntry: emptyModel, Input: emptyModel, Output: emptyModel, Classified: emptyModel,
    Transfers: emptyModel, kardexMovements: emptyModel, User: emptyModel,
  };
  await enrichKardexHistory(rows, models);
  assert.equal(rows[0].dataValues.valuation.status, 'UNVALUED');
  assert.equal(rows[0].dataValues.responsible, null);
});

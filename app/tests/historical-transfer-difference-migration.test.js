'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../database/migrations/20260905000000-create-transfer-historical-difference-completions');

test('la migración crea trazabilidad idempotente y permite revertirla', async () => {
  const created = [];
  const indexes = [];
  const constraints = [];
  const dropped = [];
  const queryInterface = {
    createTable: async (name, columns) => created.push({ name, columns }),
    addIndex: async (table, fields, options) => indexes.push({ table, fields, options }),
    addConstraint: async (table, options) => constraints.push({ table, options }),
    dropTable: async (name) => dropped.push(name),
  };
  await migration.up(queryInterface, Sequelize);
  assert.equal(created[0].name, 'transfer_historical_difference_completions');
  assert.equal(created[0].columns.idempotency_key.unique, true);
  assert.ok(created[0].columns.allocations);
  assert.ok(created[0].columns.projection_fingerprint);
  assert.deepEqual(indexes.map(({ options }) => options.name), [
    'transfer_historical_completion_transfer_type_idx',
    'transfer_historical_completion_detail_idx',
  ]);
  assert.equal(constraints[0].options.name, 'transfer_historical_completion_movement_uq');
  await migration.down(queryInterface);
  assert.deepEqual(dropped, ['transfer_historical_difference_completions']);
});


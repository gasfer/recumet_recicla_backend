'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const migration = require('../database/migrations/20260904000000-create-stock-reconciliation-cases');

test('la migración crea y revierte el expediente Stock–Kardex con sus índices', async () => {
  const createdTables = [];
  const droppedTables = [];
  const indexes = [];
  const queryInterface = {
    createTable: async (name, columns) => createdTables.push({ name, columns }),
    addIndex: async (table, fields, options) => indexes.push({ table, fields, options }),
    dropTable: async (name) => droppedTables.push(name),
  };

  await migration.up(queryInterface, Sequelize);

  assert.deepEqual(createdTables.map(({ name }) => name), [
    'stock_reconciliation_cases',
    'stock_reconciliation_events',
    'stock_reconciliation_evidences',
    'stock_reconciliation_decisions',
    'stock_reconciliation_authorizations',
    'stock_reconciliation_actions',
  ]);
  assert.ok(createdTables[0].columns.fingerprint.allowNull === false);
  assert.ok(createdTables[1].columns.metadata);
  assert.ok(createdTables[2].columns.id_user);
  assert.ok(createdTables[3].columns.strategy);
  assert.ok(createdTables[4].columns.snapshot_fingerprint);
  assert.ok(createdTables[5].columns.idempotency_key.unique);
  assert.deepEqual(indexes.map(({ options }) => options.name), [
    'stock_reconciliation_case_context_status_idx',
    'stock_reconciliation_one_open_location_idx',
    'stock_reconciliation_event_timeline_idx',
    'stock_reconciliation_evidence_case_idx',
    'stock_reconciliation_decision_case_idx',
    'stock_reconciliation_authorization_case_idx',
  ]);
  assert.equal(indexes[1].options.unique, true);

  await migration.down(queryInterface);

  assert.deepEqual(droppedTables, [
    'stock_reconciliation_actions',
    'stock_reconciliation_authorizations',
    'stock_reconciliation_decisions',
    'stock_reconciliation_evidences',
    'stock_reconciliation_events',
    'stock_reconciliation_cases',
  ]);
});

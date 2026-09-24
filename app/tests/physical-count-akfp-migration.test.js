'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260911000000-add-akfp-physical-count-adjustment');

test('la migración AKFP agrega trazabilidad y restricciones únicas', async () => {
  const columns = [];
  const indexes = [];
  const queryInterface = {
    addColumn: async (table, column) => columns.push(`${table}.${column}`),
    addIndex: async (table, fields, options) => indexes.push(options.name),
  };
  await migration.up(queryInterface, { INTEGER: 'INTEGER', STRING: 'STRING', TEXT: 'TEXT', Op: { ne: Symbol('ne'), like: Symbol('like') } });
  assert.deepEqual(columns, [
    'stock_reconciliation_actions.registry_number',
    'stock_reconciliation_actions.count_description',
    'stock_reconciliation_actions.id_count_responsible_user',
  ]);
  assert.deepEqual(indexes, [
    'stock_reconciliation_action_registry_number_unique',
    'stock_reconciliation_action_akfp_case_unique',
  ]);
});

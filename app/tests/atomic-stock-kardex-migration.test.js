'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260910000000-enforce-atomic-stock-kardex-parity');

const OLD_VIEW = "SELECT 1 WHERE tr.status = 'RECEIVED' AND COALESCE(dt.accounting_status, 'CONTABILIZADO') <> 'PENDIENTE_CONCILIACION' UNION ALL SELECT 2";

test('preflight rechaza estados, Stock duplicado o recepciones ambiguas sin escribir', async () => {
  for (const check of Object.keys(migration.preflightSql)) {
    const statements = [];
    const sequelize = {
      query: async (sql) => {
        statements.push(sql);
        if (sql === migration.preflightSql[check]) return [[{ id: 1 }]];
        return [[], {}];
      },
    };
    await assert.rejects(
      migration.runPreflight(sequelize, {}),
      (error) => error.code === 'STOCK_KARDEX_PREFLIGHT_FAILED' && error.details.check === check,
    );
    assert.equal(statements.every((sql) => /^SELECT\b/i.test(sql.trim())), true);
  }
});

test('migración normaliza estados, incluye la recepción y crea unicidad transaccional', async () => {
  const queries = [];
  const indexes = [];
  const columns = [];
  const transaction = { id: 'atomic-migration' };
  const sequelize = {
    transaction: async (work) => work(transaction),
    query: async (sql, options = {}) => {
      queries.push({ sql, options });
      if (sql.includes('pg_get_viewdef')) return [[{ definition: OLD_VIEW }], {}];
      return [[], {}];
    },
  };
  const queryInterface = {
    sequelize,
    addIndex: async (table, fields, options) => indexes.push({ table, fields, options }),
    addColumn: async (table, name, definition, options) => columns.push({ table, name, definition, options }),
  };

  await migration.up(queryInterface);

  const update = queries.find(({ sql }) => sql.includes('UPDATE details_transfers'));
  assert.match(update.sql, /WHEN 'ACCEPTED' THEN 'ACEPTADO'/);
  assert.match(update.sql, /WHEN 'REQUIRES_REVIEW' THEN 'REQUIERE_CONCILIACION'/);
  const recreatedView = queries.find(({ sql }) => sql.includes('CREATE OR REPLACE VIEW'));
  assert.equal(recreatedView.sql.includes('PENDIENTE_CONCILIACION'), false);
  assert.ok(queries.every(({ options }) => !options.transaction || options.transaction === transaction));
  assert.deepEqual(indexes.map(({ options }) => options.name), [
    'stocks_one_active_location',
    'kardex_movements_idempotency_unique',
    'kardex_movements_source_effect_unique',
  ]);
  assert.equal(indexes.every(({ options }) => options.transaction === transaction), true);
  assert.deepEqual(columns.map(({ name }) => name), [
    'source_type', 'source_id', 'source_detail_id', 'effect_type', 'idempotency_key',
  ]);
});

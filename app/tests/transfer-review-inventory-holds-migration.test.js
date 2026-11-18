'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../database/migrations/20260825000000-create-transfer-review-inventory-holds');

test('la migracion de holds no reconstruye diferencias históricas ni modifica inventario', async () => {
  const executedSql = [];
  const queryInterface = {
    showAllTables: async () => [],
    createTable: async () => undefined,
    changeColumn: async () => undefined,
    showConstraint: async () => [],
    addConstraint: async () => undefined,
    showIndex: async () => [],
    addIndex: async () => undefined,
    sequelize: { query: async (sql) => executedSql.push(sql) },
  };
  const Sequelize = {
    INTEGER: 'INTEGER',
    DECIMAL: () => 'DECIMAL',
    DATE: 'DATE',
    ENUM: () => 'ENUM',
    Op: { gt: Symbol('gt') },
  };

  await migration.up(queryInterface, Sequelize);

  const backfillSql = executedSql.join('\n');

  assert.equal(backfillSql, '');
  assert.doesNotMatch(backfillSql, /\b(?:UPDATE|DELETE)\s+(?:stocks|kardex_movements)\b/i);
});

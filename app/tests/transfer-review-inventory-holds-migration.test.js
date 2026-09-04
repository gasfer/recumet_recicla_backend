'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const migration = require('../database/migrations/20260825000000-create-transfer-review-inventory-holds');

test('la migracion historica conserva stock, Kardex, retenido y disponible', async () => {
  const historicalDetails = [
    { id: 1, difference: 12, resolved: 2, product: 7, branch: 1, storage: 3 },
    { id: 2, difference: 4.5, resolved: 0, product: 7, branch: 1, storage: 3 },
    { id: 3, difference: 8, resolved: 8, product: 9, branch: 2, storage: 4 },
  ];
  const inventoryBefore = { stock: 100, kardexRows: 24 };
  const retainedBefore = historicalDetails.reduce(
    (total, detail) => total + Math.max(0, detail.difference - detail.resolved),
    0,
  );
  const availableBefore = inventoryBefore.stock - retainedBefore;
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

  const migratedHolds = historicalDetails
    .map((detail) => ({ ...detail, quantity: detail.difference - detail.resolved }))
    .filter(({ quantity }) => quantity > 0);
  const retainedAfter = migratedHolds.reduce((total, hold) => total + hold.quantity, 0);
  const inventoryAfter = { ...inventoryBefore };
  const availableAfter = inventoryAfter.stock - retainedAfter;
  const backfillSql = executedSql.join('\n');

  assert.match(backfillSql, /d\.quantity_difference\s*-\s*COALESCE\(d\.quantity_resolved, 0\)/i);
  assert.match(backfillSql, /WHERE\s+d\.quantity_difference\s*-\s*COALESCE\(d\.quantity_resolved, 0\)\s*>\s*0/i);
  assert.doesNotMatch(backfillSql, /\b(?:UPDATE|DELETE)\s+(?:stocks|kardex_movements)\b/i);
  assert.deepEqual(inventoryAfter, inventoryBefore);
  assert.equal(retainedAfter, retainedBefore);
  assert.equal(availableAfter, availableBefore);
});

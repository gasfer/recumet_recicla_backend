'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addUnitQuantity, formatUnitTotals, normalizeStockOrder } = require('../helpers/stock-unit-totals');

test('stock totals keep quantities separate by unit', () => {
  const totals = {};
  addUnitQuantity(totals, 'KG', 12.5);
  addUnitQuantity(totals, 'PZA', 7);
  addUnitQuantity(totals, 'KG', 0.5);
  assert.deepEqual(totals, { KG: '13.0000', PZA: '7.0000' });
  assert.equal(formatUnitTotals(totals, 0), '13 KG · 7 PZA');
});

test('stock sort accepts only supported columns and normalizes direction', () => {
  assert.deepEqual(normalizeStockOrder('product.name', 'desc'), ['product', 'name', 'DESC']);
  assert.deepEqual(normalizeStockOrder('unexpected', 'up'), ['product', 'cod', 'ASC']);
});

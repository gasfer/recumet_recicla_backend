'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { buildPhysicalKardexOrder, applyPhysicalKardexSearch, normalizePhysicalCategoryIds } = require('../services/physical-kardex-query.service');
const { summarizePhysicalKardex, formatUnitTotals } = require('../helpers/physical-kardex-quantity-totals');

test('el Kardex físico conserva el orden agrupado y respeta el orden elegido', () => {
  assert.deepEqual(buildPhysicalKardexOrder('product.cod', 'ASC'), [
    ['product', 'category', 'name', 'ASC'], ['product', 'cod', 'ASC'],
  ]);
  assert.deepEqual(buildPhysicalKardexOrder('product.name', -1), [
    ['product', 'category', 'name', 'ASC'], ['product', 'name', 'DESC'],
  ]);
  assert.deepEqual(buildPhysicalKardexOrder('product.category.name', 'DESC'), [
    ['product', 'category', 'name', 'DESC'], ['product', 'cod', 'ASC'],
  ]);
});

test('la búsqueda rápida se aplica al mismo campo asociado en las consultas del Kardex', () => {
  const options = { include: [
    { association: 'product', include: [
      { association: 'unit' }, { association: 'category' },
    ] },
    { association: 'storage' },
  ] };
  applyPhysicalKardexSearch(options, 'product.category.name', 'Metales');
  assert.equal(options.include[0].include[1].where.name[Op.iLike], '%Metales%');
  assert.equal(options.include[0].include[1].required, true);

  applyPhysicalKardexSearch(options, 'storage.name', '2');
  assert.equal(options.include[1].where.name[Op.eq], '2');
});

test('los filtros de varias categorías se normalizan igual y un valor inválido no amplia resultados', () => {
  assert.deepEqual(normalizePhysicalCategoryIds('3, 4,3'), [3, 4]);
  assert.deepEqual(normalizePhysicalCategoryIds(['5', '6']), [5, 6]);
  assert.deepEqual(normalizePhysicalCategoryIds('4;DROP'), [0]);
});

test('las cantidades y totales se agrupan por unidad con suma decimal exacta', () => {
  const rows = [
    { product: { unit: { siglas: 'KG' }, category: { name: 'Metales' } }, dataValues: { quantity_input: '0.1', quantity_output: '0.04', quantity_saldo: '0.06' } },
    { product: { unit: { siglas: 'KG' }, category: { name: 'Metales' } }, dataValues: { quantity_input: '0.2', quantity_output: '0.1', quantity_saldo: '0.1' } },
    { product: { unit: { siglas: 'PZA' }, category: { name: 'Envases' } }, dataValues: { quantity_input: '2', quantity_output: '1', quantity_saldo: '1' } },
  ];
  const { totals, categories } = summarizePhysicalKardex(rows);
  assert.equal(totals.get('KG').quantity_input, '0.3000');
  assert.equal(totals.get('PZA').quantity_saldo, '1.0000');
  assert.equal(categories.get('Metales').get('KG').quantity_output, '0.1400');
  assert.equal(formatUnitTotals(totals, 'quantity_input', 2), 'KG: 0,30 · PZA: 2,00');
});

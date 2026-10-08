'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuery, buildQuery } = require('../services/provider-management-query');

test('normalizeQuery maneja arrays y valores individuales para sucursales, almacenes, categorías y productos', () => {
  const query = normalizeQuery({
    id_sucursal: [1, 2],
    id_storage: 3,
    id_category: '4,5',
    id_product: [6, 7],
  });

  assert.deepEqual(query.id_sucursales, [1, 2]);
  assert.deepEqual(query.id_storages, [3]);
  assert.deepEqual(query.id_categories, [4, 5]);
  assert.deepEqual(query.id_products, [6, 7]);
  assert.equal(query.id_sucursal, undefined);
  assert.equal(query.id_storage, undefined);
});

test('buildQuery genera condiciones IN correctas para múltiples sucursales y almacenes', () => {
  const normalized = normalizeQuery({
    id_sucursales: [10, 20],
    id_storages: [100, 200],
  });

  const { sql, replacements } = buildQuery(normalized, [10, 20]);
  assert.ok(sql.includes('i.id_sucursal IN (:id_sucursales)'));
  assert.ok(sql.includes('i.id_storage IN (:id_storages)'));
  assert.deepEqual(replacements.id_sucursales, [10, 20]);
  assert.deepEqual(replacements.id_storages, [100, 200]);
});

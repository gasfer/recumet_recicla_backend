'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuery, buildQuery } = require('../services/provider-management-query');

test('Todos con año seleccionado exige compras activas del año, conservando alcance y ubicación', () => {
  const { sql, replacements } = buildQuery(normalizeQuery({ date_mode: 'YEAR', date: '2026', activity: 'ALL',
    id_sucursal: 1, id_storage: 2, department: 'COCHABAMBA', status: true }), [1]);
  assert.equal(replacements.start, '2026-01-01T00:00:00-04:00');
  assert.equal(replacements.end, '2027-01-01T00:00:00-04:00');
  assert.match(sql, /i.date_voucher >= :start::timestamptz AND i.date_voucher < :end::timestamptz/);
  assert.match(sql, /COALESCE\(a.total_inputs, 0\) > 0/);
  assert.doesNotMatch(sql, /COALESCE\(a.total_amount, 0\) > 0/);
  assert.deepEqual(replacements.id_storages, [2]);
  assert.equal(replacements.department, 'COCHABAMBA');
  assert.match(sql, /i.status = 'ACTIVE'/);
});

test('Sin compras usa cero compras del período y Todo el historial permite el directorio completo', () => {
  const without = buildQuery(normalizeQuery({ date_mode: 'YEAR', date: '2026', activity: 'WITHOUT' }));
  assert.match(without.sql, /COALESCE\(a.total_inputs, 0\) = 0/);
  assert.doesNotMatch(without.sql, /COALESCE\(a.total_inputs, 0\) > 0/);
  const history = buildQuery(normalizeQuery({ date_mode: 'ALL', activity: 'ALL' }));
  assert.doesNotMatch(history.sql, /COALESCE\(a.total_inputs, 0\) > 0|i.date_voucher >= :start/);
});

test('entidad, responsable, departamento y ciudad se aplican conjuntamente a lista y reportes', () => {
  const q = normalizeQuery({ id_type_provider: 7, entity_type: 'PRIVATE', id_commercial_user: 9, department: 'COCHABAMBA', city: 'Sacaba' });
  const { sql, replacements } = buildQuery(q, [1]);
  assert.equal(replacements.entity_type, 'PRIVATE');
  assert.equal(replacements.id_commercial_user, 9);
  assert.equal(replacements.department, 'COCHABAMBA');
  assert.equal(replacements.city, 'Sacaba');
  assert.match(sql, /COALESCE\(c.entity_type, p.entity_type\) = :entity_type/);
  assert.match(sql, /COALESCE\(c.id_commercial_user, p.id_commercial_user\) = :id_commercial_user/);
  assert.match(sql, /UPPER\(TRIM\(b.city\)\) = UPPER\(TRIM\(:city\)\) AND UPPER\(TRIM\(b.department\)\) = UPPER\(TRIM\(:department\)\)/);
  assert.throws(() => normalizeQuery({ entity_type: 'INVALID' }), /Tipo de entidad inválido/);
});

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

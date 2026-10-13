'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { Op } = require('sequelize');
const { providerQueryFromPurchaseFilters } = require('../controllers/reports/purchase-provider-details.controller');
const { buildPurchaseDetailQuery, normalizeQuery } = require('../services/provider-management-query');
const { queryPurchaseReportPage, queryPurchaseReportTotals } = require('../services/purchase-report-query.service');

test('exportación traslada período y filtros de compras sin usar estados del directorio de proveedores', () => {
  const raw = { filterBy: 'MONTH', date1: '09', date2: '2026', id_sucursal: '1', id_storage: '2', category_ids: '3', id_products: '4',
    id_provider: '8', id_type_provider: '5', type_registry: 'FICHA', referral_sources: 'GOOGLE', status: 'INACTIVE', type_pay: 'CREDITO', old_customer: 'false', with_pickup: 'true', type: 'cod', query: 'CMP-1' };
  const q = providerQueryFromPurchaseFilters(raw);
  assert.equal(q.date, '2026-09-01'); assert.equal(q.date_end, '2026-09-30');
  assert.equal(q.purchase_status, 'ACTIVE'); assert.equal(q.status, undefined);
  const { sql, replacements } = buildPurchaseDetailQuery(normalizeQuery(q), [1]);
  assert.match(sql, /i.status = 'ACTIVE'/); assert.match(sql, /i.type = :payment_type/);
  assert.match(sql, /d.status = 'ACTIVE'/);
  assert.match(sql, /i.old_customer = :purchase_old_customer/); assert.match(sql, /i.with_pickup = :purchase_with_pickup/);
  assert.match(sql, /i.cod ILIKE :purchase_search/);
  assert.equal(replacements.purchase_old_customer, false);
  assert.equal(replacements.payment_type, 'CREDITO');
  assert.equal(replacements.purchase_referral_sources, 'GOOGLE');
  assert.match(sql, /i.referral_sources = :purchase_referral_sources/);
  assert.equal(replacements.purchase_search, '%CMP-1%');
  assert.equal(replacements.id_provider, 8);
  assert.deepEqual(replacements.id_products, [4]);
  assert.ok(!/LIMIT|OFFSET/.test(sql));
});

test('exportación por sucursal y proveedor conserva ambos extremos del rango y filtros independientes', () => {
  const q = providerQueryFromPurchaseFilters({ filterBy: 'RANGE', date1: '15-08-2026', date2: '15-09-2026',
    id_sucursal: '1,2', id_storage: '3', category_ids: '4,5', id_products: '6', id_provider: '8',
    id_type_provider: '5', status: 'ACTIVE', type_pay: 'CREDITO', type: 'cod', query: 'CMP-1' });
  assert.equal(q.date, '2026-08-15');
  assert.equal(q.date_end, '2026-09-15');
  assert.deepEqual(q.id_sucursales, [1, 2]);
  assert.deepEqual(q.id_storages, [3]);
  assert.deepEqual(q.id_categories, [4, 5]);
  assert.deepEqual(q.id_products, [6]);
  assert.equal(q.id_provider, '8');
  assert.equal(q.id_type_provider, '5');
  assert.equal(q.purchase_status, 'ACTIVE');
  assert.equal(q.payment_type, 'CREDITO');
  assert.equal(q.purchase_search, 'CMP-1');
});

test('tabla conserva tipo de proveedor al buscar por nombre y filtra campos avanzados', async t => {
  t.mock.method(db.Input, 'count', async options => {
    const provider = options.include.find(item => item.association === 'provider');
    assert.ok(provider.attributes.includes('id_type_provider'));
    assert.equal(provider.where.id_type_provider, '5');
    assert.equal(provider.where.full_names[Op.iLike], '%ANA%');
    assert.equal(provider.required, true);
    assert.ok(options.where[Op.and].some(item => item.id_provider === '8'));
    assert.ok(options.where[Op.and].some(item => item.old_customer === false));
    assert.ok(options.where[Op.and].some(item => item.with_pickup === true));
    assert.ok(options.where[Op.and].some(item => item.type_registry === 'FICHA'));
    assert.ok(options.where[Op.and].some(item => item.referral_sources === 'GOOGLE'));
    assert.ok(options.where[Op.and].some(item => item.status === 'ACTIVE'));
    return 0;
  });
  t.mock.method(db.Input, 'findAll', async options => {
    if (options.raw) {
      assert.ok(options.include.length <= 1, 'La búsqueda de página carga solo el proveedor, sin detalles');
      return [];
    }
    if (options.attributes?.includes('total')) return [];
    return [];
  });
  const result = await queryPurchaseReportPage({ filterBy: 'MONTH', date1: '09', date2: '2026', id_provider: '8', id_type_provider: '5',
    old_customer: 'false', with_pickup: 'true', type_registry: 'FICHA', referral_sources: 'GOOGLE', type: 'provider.full_names', query: 'ANA' });
  assert.equal(result.total, 0);
  assert.deepEqual(result.totals, { total_amount: 0, kg_quantity: 0, kg_total: 0, kg_purchase_price: null });
});

test('el total de la tabla separa kg de otras unidades y calcula el precio ponderado', async t => {
  t.mock.method(db.Input, 'findAll', async () => [{
    total: '120',
    detailsInput: [
      { quantity: '10', total: '100', cost: '10', product: { unit: { siglas: 'KGR' } } },
      { quantity: '2', total: '20', cost: '10', product: { unit: { siglas: 'UND' } } },
      { quantity: '5', total: '50', cost: '10', product: { unit: { siglas: 'KG' } } },
    ],
  }]);
  const totals = await queryPurchaseReportTotals({ filterBy: 'MONTH', date1: '09', date2: '2026' });
  assert.deepEqual(totals, { total_amount: 120, kg_quantity: 15, kg_total: 150, kg_purchase_price: 10 });
});

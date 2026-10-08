'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/provider-frequency.service');
const { sequelize } = require('../database/config');
const purchase = (id, date, kg, hasKg = true) => ({ id, purchase_date: date, total_kg: kg, has_kg: hasKg });

test('analiza todas las compras, fechas únicas, volumen promedio y contacto vencido', () => {
  const result = service.analyzePurchases([purchase(3, '2026-10-15', 300), purchase(1, '2026-10-01', 100), purchase(2, '2026-10-01', 200)], '2026-10-30');
  assert.equal(result.totalPurchases, 3);
  assert.equal(result.totalDeliveries, 2);
  assert.equal(result.elapsedDays, 14);
  assert.equal(result.averageDays, 14);
  assert.equal(result.frequencyCode, 'BIWEEKLY');
  assert.equal(result.totalKg, 600);
  assert.equal(result.estimatedVolume, 200);
  assert.equal(result.nextEstimatedDate, '2026-10-29');
  assert.equal(result.recommendedContactDate, '2026-10-30');
  assert.equal(result.overdueDays, 1);
  assert.deepEqual(result.purchases.map(row => row.id), [1, 2, 3]);
});

test('una sola fecha conserva kilos pero requiere frecuencia manual; sin kg no inventa volumen', () => {
  const one = service.analyzePurchases([purchase(1, '2026-10-01', 100)], '2026-10-07');
  assert.equal(one.hasSufficientHistory, false);
  assert.equal(one.estimatedVolume, 100);
  assert.equal(one.nextEstimatedDate, null);
  assert.equal(service.analyzePurchases([purchase(1, '2026-10-01', 0, false)]).estimatedVolume, null);
  assert.equal(service.analyzePurchases([]).totalPurchases, 0);
});

test('sin producto ni sucursal consulta todo el historial del proveedor y conserva filtros opcionales', async t => {
  const queries = [];
  t.mock.method(sequelize, 'query', async (sql, options) => { queries.push({ sql, options }); return [purchase(1, '2026-10-01', 10), purchase(2, '2026-10-08', 20)]; });
  const all = await service.calculateFrequency(7);
  assert.equal(all.frequencyCode, 'WEEKLY');
  assert.equal(queries[0].options.replacements.provider, 7);
  assert.match(queries[0].sql, /'kgr'/);
  assert.doesNotMatch(queries[0].sql, /AND i.id_sucursal =|AND d.id_product =/);
  await service.calculateFrequency(7, 10, 2);
  assert.match(queries[1].sql, /AND i.id_sucursal = :branch/);
  assert.match(queries[1].sql, /AND d.id_product = :product/);
  await assert.rejects(() => service.calculateFrequency('invalid'), { statusCode: 400 });
});

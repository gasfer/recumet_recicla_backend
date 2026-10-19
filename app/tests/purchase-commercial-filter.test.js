'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const db = require('../database/config');
const { providerCommercialFilter } = require('../services/provider-commercial-filter');
const { queryPurchaseReportExport, queryPurchaseReportTotals } = require('../services/purchase-report-query.service');

test('responsable comercial admite Todos y rechaza identificadores inválidos', () => {
  assert.deepEqual(providerCommercialFilter(''), {});
  assert.throws(() => providerCommercialFilter('1 OR TRUE'), { statusCode: 400 });
  const filter = providerCommercialFilter('7');
  assert.equal(filter[Op.and].length, 1);
  assert.match(JSON.stringify(filter[Op.and]), /COALESCE/);
  assert.match(JSON.stringify(filter[Op.and]), /id_commercial_user/);
});

test('exportación y totales combinan calificación y responsable comercial del proveedor', async t => {
  let calls = 0;
  t.mock.method(db.Input, 'findAll', async options => {
    calls++;
    const provider = options.include.find(item => item.association === 'provider');
    assert.equal(provider.required, true);
    assert.equal(provider.where.id_type_provider, '3');
    assert.equal(provider.where[Op.and].length, 1);
    return [];
  });
  const filters = { filterBy: 'MONTH', date1: '10', date2: '2026', id_type_provider: '3', id_commercial_user: '7' };
  await queryPurchaseReportExport(filters);
  await queryPurchaseReportTotals(filters);
  assert.equal(calls, 2);
});

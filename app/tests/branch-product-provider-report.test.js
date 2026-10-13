'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { Op } = require('sequelize');
const { buildPurchasesByBranchReport } = require('../services/purchases-by-branch-report.service');
const { generatePurchasesByBranchExcel } = require('../services/purchases-by-branch-excel.service');
const { stockProviderCondition } = require('../services/stock-provider-filter.service');

test('separa proveedores del mismo producto y preserva importes y plantilla', async t => {
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 1, name: 'MATRIZ' }]);
  t.mock.method(db.sequelize, 'query', async (sql, options) => {
    assert.match(sql, /GROUP BY.*i.id_provider, pr.full_names/);
    assert.equal(options.replacements.providerType, 2);
    assert.equal(options.replacements.provider, 8);
    return [
      { id: 10, name: 'Cobre', unit: 'KGR', category: 'METALES', id_provider: 8, provider_name: 'ANA', id_sucursal: 1, quantity: '10', amount: '100' },
      { id: 10, name: 'Cobre', unit: 'KGR', category: 'METALES', id_provider: 9, provider_name: 'LUIS', id_sucursal: 1, quantity: '20', amount: '400' },
    ];
  });
  const report = await buildPurchasesByBranchReport({ date1: '01-10-2026', date2: '08-10-2026', id_type_provider: '2', id_provider: '8' }, { byProvider: true });
  assert.equal(report.products.length, 2);
  assert.equal(report.products[0].amount, 100);
  assert.equal(report.products[1].amount, 400);
  const workbook = await generatePurchasesByBranchExcel(report);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.name, 'Sucursal producto proveedor');
  assert.equal(sheet.getCell('A1').value, 'RECUMET · COMPRAS POR SUCURSAL CLASIFICADAS POR PROVEEDOR');
  assert.equal(sheet.getCell('B5').value, 'PROVEEDOR');
  assert.equal(sheet.getCell('C7').value, 'Cobre');
  assert.equal(sheet.getCell('C8').value, 'Cobre');
  assert.equal(sheet.getCell('K8').result, 500);
});

test('stock filtra por productos comprados en la misma sucursal y valida identificadores', async () => {
  assert.deepEqual(stockProviderCondition({}), {});
  const condition = stockProviderCondition({ id_provider: '8', id_type_provider: '2' })[Op.and].val;
  assert.match(condition, /"ViewKardex".id_product, "ViewKardex".id_sucursal/);
  assert.match(condition, /SELECT d.id_product, i.id_sucursal/);
  assert.match(condition, /i.id_provider = 8 AND pr.id_type_provider = 2/);
  assert.throws(() => stockProviderCondition({ id_provider: '1 OR 1=1' }), { statusCode: 400 });
  await assert.rejects(buildPurchasesByBranchReport({ date1: '01-10-2026', date2: '08-10-2026', id_type_provider: 'bad' }), { statusCode: 400 });
});

test('consolidado aplica proveedor antes de sumar saldos por ubicación', async t => {
  const { queryKardexBalances } = require('../services/inventory-consolidated-query.service');
  t.mock.method(db.ViewKardex, 'findAll', async options => {
    const condition = options.where[Op.and].find(item => item[Op.and]?.val);
    assert.match(condition[Op.and].val, /i.id_provider = 8/);
    return [{ id_product: 10, id_sucursal: 1, quantity_saldo: '25' }];
  });
  const balances = await queryKardexBalances({ cutoffDate: new Date('2026-10-08'), providerQuery: { id_provider: '8' } });
  assert.equal(balances.get('10:loc_1'), 25);
  assert.equal(balances.has('10:loc_2'), false);
});





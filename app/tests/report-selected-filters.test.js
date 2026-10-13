'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { selectedReportFilters } = require('../services/report-selected-filters.service');
const { generatePurchasesByBranchExcel } = require('../services/purchases-by-branch-excel.service');

test('encabezado resuelve únicamente filtros seleccionados e independientes', async t => {
  const catalogs = [['id_sucursales', db.Sucursal, 'Sucursales', 'name'], ['id_storages', db.Storage, 'Área / Almacén', 'name'], ['category_ids', db.Category, 'Categorías', 'name'], ['id_products', db.Product, 'Productos', 'name'], ['id_type_provider', db.TypesProvider, 'Tipo de proveedor', 'name'], ['id_provider', db.Provider, 'Proveedor', 'full_names']];
  for (const [key, model, label, field] of catalogs) {
    t.mock.method(model, 'findAll', async () => [{ id: 1, [field]: 'SELECCIONADO' }]);
    const header = await selectedReportFilters({ [key]: '1' });
    assert.equal(header, label + ': SELECCIONADO');
  }
  assert.equal(await selectedReportFilters({}), '');
  assert.equal(await selectedReportFilters({ filterBy: 'MONTH', date1: '09', date2: '2026', showZeroSaldo: false }), 'Tipo filtrado: Mes\nFecha: 01/09/2026 AL 30/09/2026\nSaldos cero: Excluidos');
});

test('ambas plantillas de compras mantienen columnas y fórmulas con encabezados extensos', async () => {
  for (const byProvider of [false, true]) {
    const report = { byProvider, selectedFilters: 'Sucursales: MATRIZ\nCategorías: METALES\nTipo de proveedor: EMPRESAS\nProveedor: ' + 'Nombre largo '.repeat(40), period: { label: '01/09/2026 AL 30/09/2026' }, branches: [{ id: 1, name: 'MATRIZ' }], products: [{ name: 'Cobre', category: 'METALES', unit: 'KG', quantity: 10, amount: 100, branches: { 1: { quantity: 10, amount: 100, average: 10 } } }] };
    const workbook = await generatePurchasesByBranchExcel(report);
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.getCell(byProvider ? 'D3' : 'C3').value, report.selectedFilters);
    assert.ok(sheet.getRow(3).height > 40);
    assert.equal(sheet.getCell(byProvider ? 'C5' : 'B5').value, 'PRODUCTO / MATERIAL');
    if (byProvider) assert.equal(sheet.getCell('B7').value, 'SIN PROVEEDOR');
    assert.equal(sheet.getCell(byProvider ? 'E7' : 'D7').result, 10);
    assert.equal(sheet.getCell(byProvider ? 'H9' : 'G9').result, 100);
    assert.equal(sheet.views[0].ySplit, 5);
  }
});

test('stock reduce lecturas del kardex manteniendo saldos iniciales y totales', async t => {
  const { getTotalStockRecumet } = require('../controllers/kardex.controller');
  let calls = 0;
  const product = { cod: 'MP-1', name: 'Cobre', category: { name: 'METALES', type: 'RAW_MATERIAL' }, unit: { siglas: 'KG' } };
  t.mock.method(db.ViewKardex, 'findAll', async options => {
    calls++;
    if (options.group?.length === 4) {
      assert.ok(options.attributes.some(item => Array.isArray(item) && item[1] === 'first_movement_id'));
      return [{ id_product: 10, product, dataValues: { quantity_input: 10, quantity_saldo: 10, first_movement_id: 1 } }];
    }
    if (options.group) return [{ id_product: 10, id_sucursal: 1, first_movement_id: 1, quantity_saldo: 10, product, sucursal: { name: 'MATRIZ' } }];
    return [{ id_product: 10, id_sucursal: 1, saldo_inicial: 5 }];
  });
  t.mock.method(db.sequelize, 'query', async () => []);
  let payload, status;
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  await getTotalStockRecumet({ query: { filterBy: 'RANGE', date1: '01-09-2026', date2: '30-09-2026', id_sucursales: '1', id_type_provider: '2', showZeroSaldo: 'true' } }, res);
  assert.equal(status, 200);
  assert.equal(calls, 4);
  assert.equal(payload.kardexes.totals.quantity_saldo, 15);
  assert.equal(payload.kardexes.sucursalTotals[1].quantity_saldo, 15);
});

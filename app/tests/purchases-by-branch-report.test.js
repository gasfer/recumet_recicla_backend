'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const db = require('../database/config');
const { normalizeReportFilters } = require('../services/inventory-consolidated-query.service');
const { purchasePeriod, buildPurchasesByBranchReport } = require('../services/purchases-by-branch-report.service');
const { generatePurchasesByBranchExcel } = require('../services/purchases-by-branch-excel.service');

test('compras usa el período completo y rechaza fechas o filtros inválidos', async () => {
  assert.deepEqual(purchasePeriod(normalizeReportFilters({ filterBy: 'RANGE', date1: '15-08-2026', date2: '15-09-2026' })), { start: '2026-08-15', end: '2026-09-15', label: '15/08/2026 AL 15/09/2026' });
  const month = purchasePeriod(normalizeReportFilters({ filterBy: 'MONTH', date1: '02', date2: '2024' }));
  assert.equal(month.start, '2024-02-01'); assert.equal(month.end, '2024-02-29');
  const september = purchasePeriod(normalizeReportFilters({ filterBy: 'MONTH', date1: '09', date2: '2026' }));
  assert.equal(september.start, '2026-09-01'); assert.equal(september.end, '2026-09-30');
  assert.throws(() => purchasePeriod(normalizeReportFilters({ filterBy: 'RANGE', date1: '01-09-2026', date2: '31-09-2026' })), { statusCode: 400 });
  for (const dates of [['15-09-2026', '15-08-2026'], ['bad', '15-09-2026'], ['15-08-2026', 'bad']]) assert.throws(() => purchasePeriod(normalizeReportFilters({ filterBy: 'RANGE', date1: dates[0], date2: dates[1] })), { statusCode: 400 });
  await assert.rejects(() => buildPurchasesByBranchReport({ date1: '15-08-2026', date2: '15-09-2026', id_sucursales: '1,invalid' }), { statusCode: 400 });
});

test('consulta compras activas y aplica sucursal, almacén, categoría y productos', async t => {
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 1, name: 'CASA MATRIZ' }, { id: 2, name: 'REPÚBLICA' }]);
  let sql, options;
  t.mock.method(db.sequelize, 'query', async (statement, queryOptions) => {
    sql = statement; options = queryOptions;
    return [{ id: 10, cod: 'MP-1', name: 'Fierro', unit: 'KGR', category: 'Metales', id_sucursal: 1, quantity: '10', amount: '100' }, { id: 10, cod: 'MP-1', name: 'Fierro', unit: 'KGR', category: 'Metales', id_sucursal: 2, quantity: '30', amount: '600' }];
  });
  const report = await buildPurchasesByBranchReport({ date1: '15-08-2026', date2: '15-09-2026', id_sucursales: '1,2', id_storages: '3', id_products: '10', category_ids: '5' });
  assert.match(sql, /i.status = 'ACTIVE'/); assert.match(sql, /d.status = 'ACTIVE'/); assert.match(sql, /BETWEEN :start::date AND :end::date/);
  assert.deepEqual(options.replacements.storages, [3]); assert.deepEqual(options.replacements.categories, [5]); assert.deepEqual(options.replacements.products, [10]);
  assert.equal(report.products[0].quantity, 40); assert.equal(report.products[0].amount, 700); assert.equal(report.products[0].branches[2].average, 20);
});

test('clasifica la matriz por proveedor conservando el producto y sus importes por sucursal', async t => {
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 1, name: 'MATRIZ' }, { id: 2, name: 'NORTE' }]);
  t.mock.method(db.sequelize, 'query', async () => [
    { id: 10, cod: 'MP-1', name: 'Cobre', unit: 'KG', category: 'METALES', id_provider: 8, provider_name: 'ANA', id_sucursal: 1, quantity: '10', amount: '100' },
    { id: 10, cod: 'MP-1', name: 'Cobre', unit: 'KG', category: 'METALES', id_provider: 9, provider_name: 'LUIS', id_sucursal: 2, quantity: '20', amount: '400' },
  ]);
  const report = await buildPurchasesByBranchReport({ date1: '09', date2: '2026', filterBy: 'MONTH' }, { byProvider: true });
  assert.deepEqual(report.providers, [{ id: 8, name: 'ANA' }, { id: 9, name: 'LUIS' }]);
  const workbook = await generatePurchasesByBranchExcel(report);
  const sheet = workbook.worksheets[0];
  assert.deepEqual([sheet.getCell('A5').value, sheet.getCell('B5').value, sheet.getCell('C5').value], ['N.º', 'PROVEEDOR', 'PRODUCTO / MATERIAL']);
  assert.equal(sheet.getCell('B7').value, 'ANA');
  assert.equal(sheet.getCell('C7').value, 'Cobre');
  assert.equal(sheet.getCell('E7').result, 10);
  assert.equal(sheet.getCell('H8').result, 20);
  assert.equal(sheet.getCell('K10').result, 500);
});

const sample = { period: { label: '15/08/2026 AL 15/09/2026' }, branches: [{ id: 1, name: 'CASA MATRIZ' }, { id: 2, name: 'REPÚBLICA' }], products: [{ code: 'MP-1', name: 'Fierro', unit: 'KGR', category: 'METALES', quantity: 40, amount: 700, branches: { 1: { quantity: 10, amount: 100, average: 10 }, 2: { quantity: 30, amount: 600, average: 20 } } }] };
test('Excel conserva fórmulas, costos ponderados, totales y colores distintos por sucursal', async () => {
  const workbook = await generatePurchasesByBranchExcel(sample);
  const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.worksheets[0];
  assert.equal(sheet.getCell('D7').result, 10); assert.equal(sheet.getCell('G7').result, 20);
  assert.equal(sheet.getCell('I7').result, 40); assert.equal(sheet.getCell('J7').result, 700);
  assert.equal(sheet.getCell('A8').value, 'TOTAL METALES');
  assert.equal(sheet.getCell('J8').result, 700);
  assert.equal(sheet.getCell('J9').result, 700); assert.equal(sheet.getCell('G9').result, 20);
  assert.equal(sheet.getCell('D7').numFmt, '#,##0.0000');
  assert.notEqual(sheet.getCell('C7').fill.fgColor.argb, sheet.getCell('F7').fill.fgColor.argb);
  assert.equal(sheet.views[0].ySplit, 5);
  assert.equal(sheet.views[0].xSplit, 2);
  assert.equal(sheet.getCell('A5').value, 'N.º');
  assert.equal(sheet.getCell('A7').value, 1);
  assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.pageSetup.paperSize, 5);
  assert.ok(!sheet.getRow(5).values.includes('CÓDIGO'));
  assert.ok(!sheet.getRow(5).values.includes('UND'));
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 1);
  assert.equal(sheet.getImages().length, 1);
  assert.ok(sheet.getCell('B7').alignment.wrapText);
  assert.equal(sheet.pageSetup.printArea, 'A1:J9');
  const many = await generatePurchasesByBranchExcel({ ...sample, branches: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Sucursal ${index + 1}` })) });
  assert.equal(new Set(Array.from({ length: 8 }, (_, index) => many.worksheets[0].getRow(7).getCell(3 + index * 3).fill.fgColor.argb)).size, 8);
});
test('no mezcla unidades en totales de cantidades y admite períodos sin compras', async () => {
  const mixed = await generatePurchasesByBranchExcel({ ...sample, products: [...sample.products, { ...sample.products[0], code: 'PT-2', unit: 'PZA' }] });
  assert.equal(mixed.worksheets[0].getCell('I10').value, null);
  assert.equal(mixed.worksheets[0].getCell('J10').result, 1400);
  const empty = await generatePurchasesByBranchExcel({ ...sample, products: [] });
  assert.equal(empty.worksheets[0].getCell('J6').result, 0);
});

test('totaliza cada categoría y el total general excluye subtotales duplicados', async () => {
  const second = { ...sample.products[0], category: 'ALUMINIO', name: 'Aluminio', quantity: 20, amount: 300, branches: { 1: { quantity: 20, amount: 300, average: 15 } } };
  const workbook = await generatePurchasesByBranchExcel({ ...sample, products: [...sample.products, second] });
  const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.worksheets[0];
  assert.equal(sheet.getCell('A8').value, 'TOTAL METALES');
  assert.equal(sheet.getCell('A11').value, 'TOTAL ALUMINIO');
  assert.equal(sheet.getCell('I8').result, 40);
  assert.equal(sheet.getCell('J11').result, 300);
  assert.equal(sheet.getCell('C11').result, 20);
  assert.equal(sheet.getCell('F11').result, 0);
  assert.equal(sheet.getCell('A12').value, 'TOTAL GENERAL');
  assert.equal(sheet.getCell('I12').result, 60);
  assert.equal(sheet.getCell('J12').result, 1000);
  assert.equal(sheet.getCell('J12').formula, 'SUBTOTAL(9,J6:J11)');
  assert.equal(sheet.getCell('D12').result, 400 / 30);
  assert.equal(sheet.getCell('A10').value, 2);
});

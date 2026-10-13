'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const db = require('../database/config');
const { normalizeQuery, buildPurchaseDetailQuery } = require('../services/provider-management-query');
const { buildProviderPurchasesReport, selectedProviderPurchaseFilters } = require('../services/provider-purchases-report.service');
const { generateProviderPurchasesExcel, PROVIDER_PURCHASE_HEADERS } = require('../services/provider-purchases-excel.service');

test('consulta reutiliza los filtros de gestión y exporta todas las compras con proveedor', () => {
  const q = normalizeQuery({ id_sucursales: [1], id_storages: [2], id_products: [3], id_categories: [4], id_type_provider: 5,
    date_mode: 'RANGE', date: '2026-09-01', date_end: '2026-09-30', min_amount: 100, has_document: 'true', type: 'full_names', query: 'ANA', status: true, page: 2, limit: 10 });
  const { sql, replacements } = buildPurchaseDetailQuery(q, [1]);
  assert.match(sql, /i\.status = 'ACTIVE'/);
  assert.match(sql, /d\.status = 'ACTIVE'/);
  assert.match(sql, /i\.id_sucursal IN \(:allowed_branches\)/);
  assert.match(sql, /i\.id_storage IN \(:id_storages\)/);
  assert.match(sql, /d\.id_product IN \(:id_products\)/);
  assert.match(sql, /pr\.id_category IN \(:id_categories\)/);
  assert.match(sql, /p\.id_type_provider = :id_type_provider/);
  assert.match(sql, /i.date_voucher >= :start/);
  assert.equal(replacements.start, '2026-09-01T00:00:00-04:00');
  assert.equal(replacements.end, '2026-10-01T00:00:00-04:00');
  assert.equal(replacements.provider_query, '%ANA%');
  assert.ok(!/LIMIT|OFFSET|accounts_payables|view_kardex|kardex_movements/i.test(sql));
});

test('reporte respeta acceso a sucursales y no consulta compras fuera del alcance autorizado', async t => {
  let called = false;
  t.mock.method(db.sequelize, 'query', async () => { called = true; return []; });
  await assert.rejects(buildProviderPurchasesReport({ id_sucursales: [2] }, { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1, status: true }] }), { statusCode: 403 });
  assert.equal(called, false);
});

test('reporte devuelve solo compras activas agrupadas por producto/proveedor/sucursal', async t => {
  t.mock.method(db.sequelize, 'query', async (sql, { replacements }) => {
    assert.match(sql, /i\.status = 'ACTIVE'/);
    assert.doesNotMatch(sql, /accounts_payables|view_kardex/);
    assert.equal(replacements.allowed_branches[0], 1);
    return [{ branch: 'MATRIZ', storage: 'PRINCIPAL', product: 'Cobre', code: 'MP-1', category: 'METALES', unit: 'KG', provider: 'ANA', provider_type: 'A - EMPRESAS', quantity: '25', amount: '1250' }];
  });
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 1, name: 'MATRIZ' }]);
  t.mock.method(db.Product, 'findAll', async () => [{ id: 10, cod: 'MP-1', name: 'Cobre', description: '', id_category: 4, unit: { siglas: 'KG' }, category: { id: 4, name: 'METALES', type: 'RAW_MATERIAL' } }]);
  t.mock.method(db.ViewKardex, 'findAll', async options => options.attributes?.some(attr => Array.isArray(attr) && attr[1] === 'min_id') ? [] : [{ id_product: 10, id_sucursal: 1, quantity_saldo: 25 }]);
  t.mock.method(db.Transfers, 'findAll', async () => []);
  if (db.TransferReviewInventoryHold) t.mock.method(db.TransferReviewInventoryHold, 'findAll', async () => []);
  const report = await buildProviderPurchasesReport({ date_mode: 'MONTH', date: '2026-09', date_end: '2026-08-01', status: true }, { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1, status: true }] });
  assert.equal(report.rows[0].average, 50);
  assert.equal(report.rows[0].quantity, 25);
  assert.equal(report.rows[0].providerType, 'A - EMPRESAS');
  assert.equal(report.fileDate, '2026-09');
  assert.match(report.selectedFilters, /Estado: Activos/);
  assert.match(report.selectedFilters, /Período: Mes/);
  assert.ok(!report.selectedFilters.includes('2026-08-01'));
  assert.equal(report.purchaseStatus, 'ACTIVE');
  assert.match(report.selectedFilters, /Estado de compras: Activas/);
  assert.equal(report.stock, undefined);
});

test('encabezado muestra filtros independientes y no agrega filtros vacíos', async t => {
  t.mock.method(db.Provider, 'findAll', async () => [{ id: 8, full_names: 'ANA' }]);
  const text = await selectedProviderPurchaseFilters(normalizeQuery({ id_provider: 8, department: 'LA PAZ', has_contact: 'false' }));
  assert.match(text, /Proveedor: ANA/);
  assert.match(text, /Departamento: LA PAZ/);
  assert.match(text, /Con contacto: No/);
  assert.ok(!text.includes('Categorías:'));
});

test('Excel conserva las dimensiones proveedor/producto y contiene solo compras', async () => {
  const rows = [
    { branch: 'MATRIZ', storage: 'PRINCIPAL', product: 'Cobre', code: 'MP-1', category: 'METALES', unit: 'KG', provider: 'ANA', providerType: 'A - EMPRESAS', quantity: 10, amount: 100, average: 10 },
    { branch: 'MATRIZ', storage: 'PRINCIPAL', product: 'Cobre', code: 'MP-1', category: 'METALES', unit: 'KG', provider: 'LUIS', providerType: 'B - TALLERES', quantity: 20, amount: 400, average: 20 },
  ];
  const workbook = await generateProviderPurchasesExcel({ rows, period: { label: 'SEPTIEMBRE' }, selectedFilters: 'Tipo proveedor: EMPRESAS\nSucursales: MATRIZ' });
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  assert.deepEqual(sheet.getRow(5).values.slice(1), [...PROVIDER_PURCHASE_HEADERS]);
  assert.equal(sheet.getCell('E7').value, 'A - EMPRESAS');
  assert.equal(sheet.getCell('F8').value, 'LUIS');
  assert.equal(sheet.getCell('H7').formula, 'IFERROR(I7/G7,0)');
  assert.equal(sheet.getCell('H10').result, 500 / 30);
  assert.equal(sheet.getCell('I10').value, 500);
  assert.equal(sheet.getCell('G10').value, 30);
  assert.equal(sheet.views[0].ySplit, 5);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.getCell('A1').value, 'RECUMET · COMPRAS POR CATEGORÍA Y PROVEEDOR');
  assert.equal(sheet.getCell('A5').value, 'Código producto');
  assert.equal(sheet.getCell('B5').value, 'Producto');
  assert.equal(sheet.getCell('C5').value, 'Categoría');
  assert.equal(sheet.getCell('A6').value, 'METALES');
  assert.ok(!sheet.getRow(5).values.includes('Sucursal'));
  assert.ok(!sheet.getRow(5).values.includes('Almacén'));
  assert.equal(workbook.worksheets.length, 1);
  assert.match(String(sheet.getCell('A3').value), /Tipo proveedor: EMPRESAS/);
  assert.match(String(sheet.getCell('F3').value), /Sucursal: MATRIZ/);
  assert.equal(sheet.getCell('A3').fill.fgColor.argb, sheet.getCell('F3').fill.fgColor.argb);
  assert.equal(sheet.getCell('A3').alignment.wrapText, true);
  const mixed = await generateProviderPurchasesExcel({ rows: [rows[0], { ...rows[1], unit: 'UND', category: 'OTROS' }], period: { label: 'TODO' } });
  assert.equal(mixed.worksheets[0].getCell('G9').value, 20);
  assert.equal(mixed.worksheets[0].getCell('I9').value, 400);
  assert.equal(mixed.worksheets[0].getCell('G11').value, 10);
  assert.equal(mixed.worksheets[0].getCell('I11').value, 100);
  const empty = await generateProviderPurchasesExcel({ rows: [], period: { label: 'TODO' } });
  assert.equal(empty.worksheets[0].getCell('A6').value, 'No hay compras de proveedores para los filtros seleccionados.');
});

test('Excel distribuye filtros categorizados en dos filas cuando exceden el ancho disponible', async () => {
  const summary = [
    'Sucursales: CASA MATRIZ',
    'Área / Almacén: ALMACEN PRINCIPAL CASA MATRIZ',
    'Categorías: METALES FERROSOS(MP), METALES NO FERROSOS(MP), RAEES(MP)',
    'Tipo de proveedor: A - EMPRESAS E INSTITUCIONES',
    'Período: Rango',
    'Fecha: 2026-09-01 al 2026-09-30',
    'Referencia: Compras del período',
    'Estado de compras: Activas',
  ].join('\n');
  const workbook = await generateProviderPurchasesExcel({ rows: [], period: { label: '2026-09-01 AL 2026-09-30' }, selectedFilters: summary });
  const sheet = workbook.worksheets[0];
  assert.notEqual(sheet.getCell('A3').value, undefined);
  assert.notEqual(sheet.getCell('A4').value, undefined);
  assert.equal(sheet.getCell('A5').value, 'Costo promedio = importe de compras / cantidad comprada. Cantidades expresadas en la unidad del producto.');
  assert.equal(sheet.getCell('A6').value, 'Código producto');
});

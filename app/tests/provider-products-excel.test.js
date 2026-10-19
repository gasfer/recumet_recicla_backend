'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { generateProviderProductsExcel } = require('../services/provider-products-excel.service');
const { normalizeQuery, buildPurchaseDetailQuery } = require('../services/provider-management-query');

test('proveedores por producto conserva filtros comerciales y compras positivas del mes', () => {
  const query = normalizeQuery({ date_mode: 'MONTH', date: '2026-10', date_basis: 'PURCHASES', status: true,
    activity: 'POSITIVE', id_sucursal: 1, id_storage: 2, id_products: 3, department: 'Cochabamba', has_document: true });
  const { sql, replacements } = buildPurchaseDetailQuery(query, [1], { providerManagement: true });
  assert.match(sql, /i.id_provider IN \(SELECT id FROM filtered\)/);
  assert.match(sql, /COALESCE\(a.total_amount, 0\) > 0/);
  assert.match(sql, /UPPER\(TRIM\(p.department\)\) = UPPER\(TRIM\(:department\)\)/);
  assert.match(sql, /i.date_voucher >= :start/);
  assert.match(sql, /i.id_storage IN \(:id_storages\)/);
  assert.match(sql, /d.id_product IN \(:id_products\)/);
  assert.deepEqual(replacements.allowed_branches, [1]);
  assert.deepEqual(replacements.id_storages, [2]);
  assert.equal(replacements.start, '2026-10-01T00:00:00-04:00');
  assert.doesNotMatch(sql, /LIMIT :limit OFFSET :offset/);
});

test('Todos elimina el límite de compras positivas sin alterar período ni permisos', () => {
  const query = normalizeQuery({ activity: 'ALL', date_mode: 'MONTH', date: '2026-10' });
  const { sql, replacements } = buildPurchaseDetailQuery(query, [1], { providerManagement: true });
  assert.doesNotMatch(sql, /COALESCE\(a.total_amount, 0\) > 0/);
  assert.deepEqual(replacements.allowed_branches, [1]);
  assert.equal(replacements.end, '2026-11-01T00:00:00-04:00');
});

test('Excel por producto conserva dimensiones, números y plantilla empresarial con logo', async () => {
  const workbook = generateProviderProductsExcel({ rows: [
    { code: '001', product: 'Cobre', category: 'Metales', unit: 'KG', provider: 'Proveedor A', providerType: 'Acopiador', branch: 'Casa Matriz', storage: 'Principal', quantity: 10, average: 4.2, amount: 42 },
    { code: '002', product: 'Piezas', category: 'Otros', unit: 'UND', provider: 'Proveedor B', providerType: 'Empresa', branch: 'Casa Matriz', storage: 'Principal', quantity: 5, average: 2, amount: 10 },
  ] }, ['Período: Octubre de 2026', 'Compras: Todos'], 2);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  assert.equal(sheet.name, 'Proveedores por producto');
  assert.match(sheet.getCell('B1').value, /PROVEEDORES POR PRODUCTO/);
  assert.equal(sheet.getCell('A3').value, 'Período: Octubre de 2026\nCompras: Todos');
  assert.deepEqual(sheet.getRow(4).values.slice(1), ['Código producto', 'Producto', 'Categoría', 'Unidad', 'Proveedor', 'Tipo proveedor', 'Sucursal', 'Almacén', 'Cantidad comprada', 'Promedio Bs/unidad', 'Total Bs']);
  assert.equal(sheet.getCell('A5').value, '001');
  assert.equal(sheet.getCell('I5').value, 10);
  assert.equal(sheet.getCell('J5').value, 4.2);
  assert.equal(sheet.getCell('K5').value, 42);
  assert.equal(sheet.getCell('D6').value, 'UND');
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.autoFilter, 'A4:K6');
});

test('el botón products despacha el reporte por producto con los filtros y usuario de la petición', async t => {
  const company = require('../helpers/company');
  const management = require('../services/provider-management.service');
  const reports = require('../services/provider-purchases-report.service');
  const excel = require('../services/provider-products-excel.service');
  const headerService = require('../services/provider-report-header.service');
  const query = { report: 'products', management: 'true', activity: 'ALL', date_mode: 'MONTH', date: '2026-10', id_storage: '2' };
  const user = { role: 'OPERADOR' };
  let generated = false;
  t.mock.method(company, 'getNumberDecimal', async () => 2);
  t.mock.method(management, 'catalogs', async received => { assert.equal(received, user); return {}; });
  t.mock.method(management, 'exportRows', async () => assert.fail('No debe generar el reporte maestro'));
  t.mock.method(reports, 'buildProviderPurchasesReport', async (received, receivedUser, options) => {
    assert.deepEqual(received, { ...query, status: true, purchase_status: 'ACTIVE' });
    assert.equal(receivedUser, user);
    assert.equal(options.providerManagement, true);
    return { rows: [] };
  });
  t.mock.method(headerService, 'providerReportHeader', async () => ({ city: 'Cochabamba', nit: '123', branchName: 'Casa Matriz' }));
  t.mock.method(excel, 'generateProviderProductsExcel', (report, filters, decimal) => {
    generated = true;
    assert.equal(decimal, 2);
    assert.ok(filters.includes('Compras: Todos'));
    return { xlsx: { write: async res => { res.written = true; } } };
  });
  const { generateExcelProviders } = require('../controllers/reports/providers.controller');
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; }, end() { this.ended = true; } };
  await generateExcelProviders({ query, userAuth: user }, res);
  assert.equal(generated, true);
  assert.equal(res.written, true);
  assert.equal(res.ended, true);
  assert.match(headers['Content-Disposition'], /recumet-proveedores-por-producto.xlsx/);
});

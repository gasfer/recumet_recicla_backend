'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { generateProviderDirectoryExcel } = require('../services/provider-directory-excel.service');
const { normalizeQuery, buildQuery } = require('../services/provider-management-query');
const { providerDirectoryFilters } = require('../services/provider-directory-filters.service');

test('KGR y KILOGRAMOS suman todos los materiales y el costo total es kg por promedio ponderado', async () => {
  const workbook = generateProviderDirectoryExcel([
    { id: 1, full_names: 'General', quantities: [{ unit: 'KGR.', quantity: 100 }, { unit: 'kilogramos', quantity: 300 }], report_kg_amount: 1300, total_amount: 1300 },
    { id: 2, full_names: 'Producto filtrado', quantities: [{ unit: ' KILO ', quantity: 100 }], report_kg_amount: 250, total_amount: 250 },
  ]);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  const headers = sheet.getRow(3).values.slice(1);
  const value = (row, name) => sheet.getRow(row).getCell(headers.indexOf(name) + 1).value;
  assert.equal(value(4, 'Total kg'), 400);
  assert.equal(value(4, 'Costo promedio (Bs/kg)'), 3.25);
  assert.equal(value(4, 'Total Bs').result, 1300);
  assert.ok(value(4, 'Total Bs').formula.includes('*'));
  assert.equal(value(5, 'Total kg'), 100);
  assert.equal(value(5, 'Costo promedio (Bs/kg)'), 2.5);
  assert.equal(value(5, 'Total Bs').result, 250);
});

test('Excel conserva ceros, documentos, fechas y formatos, y omite columnas vacías', async () => {
  const workbook = generateProviderDirectoryExcel([
    { full_names: 'Proveedor A', total_amount: 0, total_inputs: 0, saldo_cuentas_por_pagar: 0, number_document: '00123', name_contact: ' ', direction: '-', date_last_input: '2026-10-12T12:00:00Z' },
    { full_names: 'Proveedor B', total_amount: 42.5, total_inputs: 1, saldo_cuentas_por_pagar: 10, number_document: null },
  ], ['Sucursales: Casa Matriz']);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  const headers = sheet.getRow(4).values.slice(1);
  assert.ok(!headers.includes('Contacto'));
  assert.ok(!headers.includes('Dirección'));
  assert.equal(sheet.getRow(5).getCell(headers.indexOf('Total Bs') + 1).value, 0);
  assert.equal(sheet.getRow(5).getCell(headers.indexOf('CI/NIT') + 1).value, '00123');
  assert.ok(sheet.getRow(5).getCell(headers.indexOf('Última compra') + 1).value instanceof Date);
  assert.equal(sheet.getRow(6).getCell(headers.indexOf('Total Bs') + 1).value, 42.5);
  assert.equal(sheet.views[0].ySplit, 4);
  assert.equal(sheet.getCell('A3').value, 'Sucursales: Casa Matriz');
});

test('Excel vacío informa que no hay resultados sin crear un proveedor ficticio', () => {
  const sheet = generateProviderDirectoryExcel([]).worksheets[0];
  assert.equal(sheet.getCell('A3').value, 'Nombre / Razón social');
  assert.match(sheet.getCell('A4').value, /No hay proveedores/);
});

test('exportación completa conserva filtros, orden y alcance de sucursales', () => {
  const q = normalizeQuery({ status: true, id_sucursal: '1', id_categories: '2', date_mode: 'MONTH', date: '2026-10', field_sort: 'total_amount', order: 'DESC' });
  const exported = buildQuery(q, [1], { unpaginated: true });
  assert.doesNotMatch(exported.sql, /LIMIT :limit OFFSET :offset/);
  assert.match(buildQuery(q, [1]).sql, /LIMIT :limit OFFSET :offset/);
  assert.match(exported.sql, /ORDER BY total_amount DESC/);
  assert.deepEqual(exported.replacements.id_sucursales, [1]);
  assert.deepEqual(exported.replacements.id_categories, [2]);
});

test('reporte maestro usa datos reales y calcula Bs/kg sin incluir compras en otras unidades', async () => {
  const workbook = generateProviderDirectoryExcel([{
    id: 7, full_names: 'Proveedor con unidades mixtas', number_document: '00123', type: { code: 'A', name: 'Acopiador' },
    report_locations: [{ department: 'Cochabamba', city: 'Sacaba', address: 'Av. Principal' }],
    report_contact: { name: 'Contacto principal', cellphone: '070000001' },
    report_branches: 'Casa Matriz, Santa Cruz', total_inputs: 3,
    quantities: [{ unit: 'KG', quantity: '100' }, { unit: 'UND', quantity: '20' }],
    report_kg_amount: '420', total_amount: '900', saldo_cuentas_por_pagar: '50',
    date_last_input: '2026-10-13T02:00:00Z',
  }], ['Período: Octubre 2026'], 2);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  const headers = sheet.getRow(4).values.slice(1);
  assert.deepEqual(headers, ['Código', 'Nombre / Razón social', 'CI/NIT', 'Dirección', 'Celular', 'Compras', 'Total kg', 'Total Bs', 'Costo promedio (Bs/kg)', 'Última compra', 'Saldo Bs']);
  const cell = name => sheet.getRow(5).getCell(headers.indexOf(name) + 1);
  assert.equal(cell('Código').value, 'P-007');
  assert.equal(cell('Nombre / Razón social').value, 'A - Proveedor con unidades mixtas');
  assert.equal(cell('Celular').value, '070000001');
  assert.equal(cell('Total kg').value, 100);
  assert.equal(cell('Costo promedio (Bs/kg)').value, 4.2);
  assert.equal(cell('Total Bs').value, 900);
  assert.ok(!headers.includes('Otras unidades'));
  assert.equal(cell('Última compra').value.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(sheet.views[0].xSplit, 2);
  assert.equal(sheet.autoFilter, 'A4:K5');
});

test('sin kg no inventa promedios y respeta cero decimales', () => {
  const sheet = generateProviderDirectoryExcel([{ id: 1, full_names: 'Proveedor', quantities: [{ unit: 'UND', quantity: 5 }], total_amount: 25, report_kg_amount: null }], [], 0).worksheets[0];
  const headers = sheet.getRow(3).values.slice(1);
  assert.ok(headers.includes('Costo promedio (Bs/kg)'));
  assert.equal(sheet.getRow(4).getCell(headers.indexOf('Costo promedio (Bs/kg)') + 1).value, null);
  assert.equal(sheet.getRow(4).getCell(headers.indexOf('Total kg') + 1).value, 0);
  assert.equal(sheet.getRow(4).getCell(headers.indexOf('Total Bs') + 1).numFmt, '#,##0');
});

test('exportación enriquece solo la consulta completa con detalle filtrado de kg y sucursales', () => {
  const q = normalizeQuery({ id_sucursal: 1, id_products: [3], date_mode: 'MONTH', date: '2026-10' });
  const { sql, replacements } = buildQuery(q, [1], { unpaginated: true, purchaseDetails: true });
  assert.match(sql, /SUM\(sd.total\) FILTER/);
  assert.match(sql, /FROM matched mi LEFT JOIN sucursals/);
  assert.match(sql, /LEFT JOIN selected_details sd/);
  assert.match(sql, /pc.status = TRUE/);
  assert.deepEqual(replacements.id_products, [3]);
  assert.deepEqual(replacements.allowed_branches, [1]);
  assert.doesNotMatch(buildQuery(q, [1]).sql, /report_contact|export_metrics/);
});

test('exportar proveedores respeta permisos y habilita los datos del reporte maestro', async t => {
  const db = require('../database/config');
  const management = require('../services/provider-management.service');
  let calls = 0;
  t.mock.method(db.sequelize, 'query', async (sql, options) => {
    calls++;
    assert.ok(sql.includes(`LEFT JOIN ${db.Sucursal.getTableName()} su`));
    assert.match(sql, /report_kg_amount/);
    assert.doesNotMatch(sql, /LIMIT :limit OFFSET :offset/);
    assert.deepEqual(options.replacements.allowed_branches, [1]);
    return [{ data: [{ id: 7, full_names: 'Proveedor', report_kg_amount: 420 }] }];
  });
  const user = { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1, status: true }] };
  await assert.rejects(management.exportRows({ id_sucursal: 2 }, user), { statusCode: 403 });
  assert.equal(calls, 0);
  const rows = await management.exportRows({ id_sucursal: 1 }, user);
  assert.equal(rows[0].report_kg_amount, 420);
  assert.equal(calls, 1);
});

test('encabezado empresarial agrupa solo filtros seleccionados en una fila y conserva el logo', async () => {
  const filters = providerDirectoryFilters({
    date_mode: 'MONTH', date: '2026-10', date_basis: 'PURCHASES', status: 'true',
    id_sucursal: '1', id_storage: '2', activity: 'POSITIVE', department: '', id_categories: [],
    management: true, page: 1, limit: 50, type: '', query: '',
  }, { branches: [{ id: 1, name: 'CASA MATRIZ' }], storages: [{ id: 2, name: 'ALMACÉN PRINCIPAL' }] });
  assert.ok(filters.some(filter => /Período: Octubre.*2026/.test(filter)));
  assert.ok(filters.includes('Sucursales: CASA MATRIZ'));
  assert.ok(filters.includes('Almacenes: ALMACÉN PRINCIPAL'));
  assert.ok(filters.includes('Compras: Mayores a Bs 0'));
  assert.ok(!filters.some(filter => /Departamento|Categorías|management|page|limit|Campo de búsqueda/.test(filter)));
  const workbook = generateProviderDirectoryExcel([{ id: 1, full_names: 'Proveedor', total_amount: 20 }], filters);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  assert.equal(sheet.getCell('A3').value, filters.join('\n'));
  assert.equal(sheet.getCell('A3').alignment.wrapText, true);
  assert.ok(sheet.getRow(3).height >= filters.length * 15);
  assert.ok(sheet.model.merges.includes(`A3:${sheet.getColumn(sheet.columnCount).letter}3`));
  assert.equal(sheet.getRow(4).getCell(1).value, 'Código');
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.getImages()[0].range.ext.width <= 96, true);
});

test('compras positivas usa un límite estricto y conserva mes, sucursal y almacén', () => {
  const q = normalizeQuery({ date_mode: 'MONTH', date: '2026-10', activity: 'POSITIVE', id_sucursal: 1, id_storage: 2 });
  const { sql, replacements } = buildQuery(q, [1]);
  assert.match(sql, /COALESCE\(a.total_amount, 0\) > 0/);
  assert.equal(replacements.start, '2026-10-01T00:00:00-04:00');
  assert.equal(replacements.end, '2026-11-01T00:00:00-04:00');
  assert.deepEqual(replacements.id_sucursales, [1]);
  assert.deepEqual(replacements.id_storages, [2]);
  assert.doesNotMatch(buildQuery(normalizeQuery({ date_mode: 'ALL' }), [1]).sql, /COALESCE\(a.total_amount, 0\) > 0/);
});

test('períodos en rango y valores No se conservan sin mostrar controles técnicos', () => {
  const filters = providerDirectoryFilters({ date_mode: 'RANGE', date: '2026-10-01', date_end: '2026-10-16', has_contact: false, min_amount: 0 });
  assert.ok(filters.includes('Período: 01/10/2026 al 16/10/2026'));
  assert.ok(filters.includes('Con contacto: No'));
  assert.ok(filters.includes('Compras mínimas (Bs): 0'));
  assert.ok(!filters.some(filter => /Desde|Hasta|RANGE/.test(filter)));
});

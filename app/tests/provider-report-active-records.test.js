'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const db = require('../database/config');
const { Op } = require('sequelize');
const { buildQuery, normalizeQuery, buildPurchaseDetailQuery } = require('../services/provider-management-query');
const management = require('../services/provider-management.service');
const { providerReportHeader } = require('../services/provider-report-header.service');
const { generateProviderDirectoryExcel } = require('../services/provider-directory-excel.service');

test('Todos elimina entidad oculta y otros tipos no admiten entidad empresarial', async t => {
  assert.equal(normalizeQuery({ entity_type: 'PRIVATE' }).entity_type, undefined);
  t.mock.method(db.TypesProvider, 'findOne', async () => ({ code: 'C' }));
  await assert.rejects(management.normalizeScopedQuery({ id_type_provider: 3, entity_type: 'PRIVATE' }, { role: 'ADMINISTRADOR' }), { statusCode: 400 });
});

test('Empresas permite entidad y Todos no fuerza compras positivas', async t => {
  t.mock.method(db.TypesProvider, 'findOne', async () => ({ code: 'A' }));
  const { q } = await management.normalizeScopedQuery({ id_type_provider: 1, entity_type: 'PRIVATE', activity: 'ALL', date_mode: 'MONTH', date: '2026-10' }, { role: 'ADMINISTRADOR' });
  assert.equal(q.entity_type, 'PRIVATE');
  const { sql } = buildQuery(q);
  assert.doesNotMatch(sql, /COALESCE\(a.total_amount, 0\) > 0/);
  assert.match(sql, /COALESCE\(a.total_inputs, 0\) > 0/);
});

test('boletas distintas y kilos usan detalles activos; el saldo conserva deuda previa al período', () => {
  const query = normalizeQuery({ date_mode: 'MONTH', date: '2026-10', id_sucursal: 1, id_storage: 2, id_products: 3 });
  const { sql } = buildQuery(query, [1]);
  assert.match(sql, /COUNT\(DISTINCT i.id\) total_inputs/);
  assert.match(sql, /d.status = 'ACTIVE' AND d.removed_at IS NULL AND pr.status = TRUE/);
  assert.match(sql, /i.voided_at IS NULL/);
  assert.doesNotMatch(sql, /d.status IS NULL/);
  assert.match(sql, /JOIN detail_amounts da ON da.id_input = i.id/);
  assert.match(sql, /pr.id IN \(:id_products\)/);
  const balances = sql.slice(sql.indexOf('balances AS'), sql.indexOf('filtered AS'));
  assert.match(balances, /ap.status = TRUE/);
  assert.match(balances, /ap.superseded_by IS NULL/);
  assert.match(balances, /i.id_storage IN \(:id_storages\)/);
  assert.doesNotMatch(balances, /:start|:end|selected_details|id_products|id_user/);
});

test('exportación excluye proveedores inactivos y conserva compras de responsables inactivos', async t => {
  t.mock.method(db.sequelize, 'query', async (sql, { replacements }) => {
    assert.equal(replacements.status, true);
    assert.match(sql, /i.status = 'ACTIVE'/);
    assert.doesNotMatch(sql, /i.status = 'INACTIVE'|JOIN users|user.status/);
    assert.equal(replacements.id_type_provider, 7);
    return [{ data: [] }];
  });
  await management.exportRows({ status: false, purchase_status: 'INACTIVE', id_type_provider: 7 }, { role: 'ADMINISTRADOR' });
});

test('reporte por producto cuenta una boleta por producto y descarta líneas eliminadas', () => {
  const { sql } = buildPurchaseDetailQuery(normalizeQuery({ status: true, id_products: 3 }), [1], { providerManagement: true });
  assert.match(sql, /COUNT\(DISTINCT i.id\) AS purchase_count/);
  assert.match(sql, /d.removed_at IS NULL/);
  assert.match(sql, /i.voided_at IS NULL/);
  assert.match(sql, /pr.status = TRUE/);
  assert.match(sql, /p.status = :status/);
});

test('encabezado obtiene datos de empresa y solo las sucursales seleccionadas autorizadas', async t => {
  t.mock.method(db.Company, 'findOne', async ({ where }) => {
    assert.deepEqual(where, { id: 9, status: true });
    return { nit: '0012345', email: 'empresa@example.test', cellphone: '70000000' };
  });
  t.mock.method(db.Sucursal, 'findAll', async ({ where }) => {
    assert.deepEqual(where.id[Op.in], [1]);
    assert.equal(where.id_company, 9);
    assert.equal(where.status, true);
    return [{ name: 'CASA MATRIZ', city: 'Cochabamba', email: 'matriz@example.test', cellphone: '70000001' }];
  });
  const company = await providerReportHeader({ id_sucursal: '1' }, { branches: [{ id: 1 }, { id: 2 }] }, 9);
  assert.equal(company.city, 'Cochabamba');
  assert.equal(company.nit, '0012345');
  assert.equal(company.branchName, 'CASA MATRIZ');
  assert.match(company.phone, /70000001/);
  assert.match(company.email, /matriz@example.test/);
  const workbook = generateProviderDirectoryExcel([{ id: 1, full_names: 'Proveedor', total_amount: 100 }], ['Sucursales: CASA MATRIZ'], 2, { company });
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = restored.worksheets[0];
  assert.match(sheet.getCell('B1').value, /Cochabamba\nNIT: 0012345\nTel\.:/);
  assert.equal(sheet.getCell('C1').value, 'REPORTE MAESTRO DE PROVEEDORES');
  assert.match(sheet.getCell('C2').value, /^Sucursal: CASA MATRIZ\n/);
  assert.equal(sheet.getImages().length, 1);
});

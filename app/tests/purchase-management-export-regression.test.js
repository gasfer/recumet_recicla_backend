'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../database/config');
const company = require('../helpers/company');
const pdf = require('../services/pdf/report-pdf.service');
const { normalizePurchaseReportFilters, buildPurchaseReportWhere } = require('../services/purchase-report-filters.service');
const { queryPurchaseReportExport } = require('../services/purchase-report-query.service');

const base = { filterBy: 'MONTH', date1: '10', date2: '2026', id_sucursal: '1', id_storage: '2', status: 'ACTIVE' };
const fixture = () => ({ id: 1, cod: 'COMP-TEST', date_voucher: '2026-10-12T12:00:00Z', type_registry: 'BOLETA', registry_number: '001', type: 'CONTADO', total: 100,
  provider: { full_names: 'Proveedor prueba', type: { name: 'Empresa' } }, dataValues: {},
  detailsInput: [{ quantity: 20, total: 100, cost: 5, product: { id: 3, cod: 'MAT-TEST', name: 'Material prueba', unit: { siglas: 'KGR' } } }],
});

test('cada filtro escalar funciona de forma independiente y Sí/No no desaparecen', () => {
  for (const [key, value, column, expected] of [
    ['id_provider', '4', 'id_provider', '4'], ['type_registry', 'BOLETA', 'type_registry', 'BOLETA'],
    ['type_pay', 'CREDITO', 'type', 'CREDITO'], ['referral_sources', 'REDES', 'referral_sources', 'REDES'],
    ['old_customer', 'SI', 'old_customer', true], ['old_customer', 'NO', 'old_customer', false],
    ['with_pickup', 'SI', 'with_pickup', true], ['with_pickup', 'NO', 'with_pickup', false],
  ]) {
    const where = buildPurchaseReportWhere(normalizePurchaseReportFilters({ ...base, [key]: value }));
    assert.ok(where[Op.and].some(item => item[column] === expected), key + ': ' + value);
  }
});

test('día, mes, año y rango producen períodos propios; sucursal y almacén son filtros independientes', () => {
  for (const [filterBy, date1, date2, start, end] of [
    ['DAY', '12-10-2026', '', '2026-10-12T04:00:00.000Z', '2026-10-13T04:00:00.000Z'],
    ['MONTH', '10', '2026', '2026-10-01T04:00:00.000Z', '2026-11-01T04:00:00.000Z'],
    ['YEAR', '2026', '', '2026-01-01T04:00:00.000Z', '2027-01-01T04:00:00.000Z'],
    ['RANGE', '01-10-2026', '15-10-2026', '2026-10-01T04:00:00.000Z', '2026-10-16T04:00:00.000Z'],
  ]) {
    const where = buildPurchaseReportWhere(normalizePurchaseReportFilters({ filterBy, date1, date2 }));
    const dates = where[Op.and].find(item => item.date_voucher).date_voucher;
    assert.equal(dates[Op.gte].toISOString(), start);
    assert.equal(dates[Op.lt].toISOString(), end);
  }
  for (const key of ['id_sucursal', 'id_storage']) {
    const where = buildPurchaseReportWhere(normalizePurchaseReportFilters({ ...base, [key]: '7' }));
    assert.deepEqual(where[Op.and].find(item => item[key])[key][Op.in], [7]);
  }
});

test('tipo, responsable y entidad no requieren seleccionar proveedor', async t => {
  for (const extra of [{ id_type_provider: '1' }, { id_commercial_user: '7' }, { id_type_provider: '1', entity_type: 'PRIVATE' }]) {
    t.mock.method(db.Input, 'findAll', async options => {
      const provider = options.include.find(item => item.association === 'provider');
      assert.equal(provider.required, true);
      if (extra.id_type_provider) assert.equal(provider.where.id_type_provider, '1');
      if (extra.id_commercial_user || extra.entity_type) assert.ok(provider.where[Op.and].length);
      assert.ok(!options.where[Op.and].some(item => item.id_provider));
      return [];
    });
    await queryPurchaseReportExport({ ...base, ...extra });
    t.mock.restoreAll();
  }
});

test('las cinco opciones del menú generan contenido con los mismos filtros y datos', async t => {
  t.mock.method(company, 'getNumberDecimal', async () => 2);
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Casa Matriz', city: 'Cochabamba', company: { nit: '123' } }));
  t.mock.method(db.Storage, 'findAll', async () => [{ name: 'Almacén principal' }] );
  let rendered;
  t.mock.method(pdf, 'sendReportPdf', async (res, document) => { rendered = document; res.end(); });
  t.mock.method(db.Input, 'findAll', async options => {
    const date = options.where[Op.and].find(item => item.date_voucher).date_voucher;
    assert.equal(date[Op.gte].toISOString(), '2026-10-01T04:00:00.000Z');
    assert.equal(date[Op.lt].toISOString(), '2026-11-01T04:00:00.000Z');
    assert.ok(options.where[Op.and].some(item => item.id_storage?.[Op.in]?.includes(2)));
    return [fixture()];
  });
  const controller = require('../controllers/reports/input.controller');
  for (const [handler, format] of [ ['generateExcelReports', 'excel'], ['generatePdfReports', 'pdf'],
    ['generatePdfDetailsReports', 'pdf'], ['generatePdfDetailsCPPReports', 'pdf'], ['generateExcelDetailsReports', 'excel'] ]) {
    await t.test(handler, async () => {
      rendered = null;
      const res = new PassThrough();
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.setHeader = () => {};
      res.status = status => { assert.fail(handler + ' respondió ' + status); };
      await controller[handler]({ query: base, userAuth: { full_names: 'Operador' } }, res);
      if (format === 'pdf') {
        assert.ok(rendered.rows.length > 1);
        assert.match(JSON.stringify(rendered.rows), /MAT-TEST|COMP-TEST/);
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.concat(chunks));
        const sheet = workbook.worksheets[0];
        const rows = [];
        sheet.eachRow(row => rows.push(row.values));
        assert.match(JSON.stringify(rows), /MAT-TEST|COMP-TEST/);
        assert.match(JSON.stringify(rows), /Sucursal: Casa Matriz/);
        assert.match(JSON.stringify(rows), /Almacén: Almacén principal/);
        assert.match(JSON.stringify(rows), /octubre de 2026/);
        assert.ok(sheet.getImages().length, 'logo RECUMET');
        assert.equal(sheet.views[0].state, 'frozen');
        assert.ok(sheet.autoFilter);
        assert.equal(sheet.getRow(sheet.views[0].ySplit).getCell(1).fill.fgColor.argb, 'FF1E5B3A');
      }
    });
  }
  t.mock.method(db.Input, 'findAll', async () => []);
  for (const handler of ['generateExcelReports', 'generatePdfReports', 'generatePdfDetailsReports', 'generatePdfDetailsCPPReports', 'generateExcelDetailsReports']) {
    await t.test(handler + ' sin coincidencias informa el motivo en lugar de descargar en blanco', async () => {
      let response;
      const res = { status(code) { assert.equal(code, 404); return this; }, json(body) { response = body; } };
      await controller[handler]({ query: base, userAuth: {} }, res);
      assert.equal(response.ok, false);
      assert.match(response.errors[0].msg, /No hay/);
    });
  }
});

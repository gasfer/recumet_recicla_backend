'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const db = require('../database/config');
const company = require('../helpers/company');
const pdf = require('../services/pdf/report-pdf.service');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');
const { buildOutputSearch, buildOutputWhere, outputOrder, outputListOrder, sortOutputQuantities } = require('../services/output-report-query.service');

const filterParams = {
  filterBy: 'RANGE', date1: '01-10-2026', date2: '31-10-2026',
  id_sucursal: '1', id_storage: '2', id_client: '3',
  type_registry: 'BOLETA', type_output: 'MAYOR. NACIONAL', type_pay: 'CONTADO', status: 'ACTIVE',
  type: 'client.full_names', query: 'Cliente Norte', orderNew: ['date_output', 'ASC'],
};

function responseMock() {
  const response = new PassThrough();
  response.setHeader = () => {};
  response.status = code => { response.statusCode = code; return response; };
  response.json = body => { response.body = body; return response; };
  return response;
}

function outputFixture() {
  return {
    cod: 'V-001', date_output: '2026-10-20T10:00:00.000Z', type_registry: 'BOLETA', number_registry: '001',
    client: { full_names: 'Cliente Norte' }, voucher: 'MAYOR. NACIONAL', type_output: 'CONTADO',
    comments: 'Venta de prueba', total: 25.5,
    detailsOutput: [{ quantity: 2.5, product: { name: 'Aluminio', unit: { siglas: 'KG' } } }],
  };
}

function loadReportController() {
  const path = require.resolve('../controllers/reports/output.controller');
  delete require.cache[path];
  return require(path);
}

test('los filtros de Ventas conservan tipo de venta, búsqueda asociada y orden', () => {
  const where = buildOutputWhere(filterParams);
  const and = where[Op.and];
  assert.ok(and.some(condition => condition.voucher === filterParams.type_output));
  assert.ok(and.some(condition => condition.type_output === filterParams.type_pay));
  assert.ok(and.some(condition => condition.type_registry === filterParams.type_registry));
  assert.ok(and.some(condition => condition.id_client === filterParams.id_client));

  const search = buildOutputSearch(filterParams);
  assert.equal(search.association, 'client');
  assert.equal(search.condition.full_names[Op.iLike], '%Cliente Norte%');
  assert.deepEqual(outputOrder(filterParams).order, [['date_output', 'ASC']]);
  const listOrder = outputListOrder({ orderNew: ['total_quantity', 'ASC'] }, { literal: value => ({ val: value }) });
  assert.match(listOrder[0][0].val, /details_outputs/);
  assert.equal(listOrder[0][1], 'ASC');

  const sorted = sortOutputQuantities([{ total_quantity: 2 }, { total_quantity: 1 }], 'ASC');
  assert.deepEqual(sorted.map(row => row.total_quantity), [1, 2]);
});

test('PDF y Excel generales aplican los filtros seleccionados y exportan las filas filtradas', async t => {
  let findOptions;
  t.mock.method(db.Output, 'findAll', async options => { findOptions = options; return [outputFixture()]; });
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Sucursal Norte', city: 'La Paz', email: 'sucursal@example.com', company: { nit: '123' } }));
  t.mock.method(db.Storage, 'findByPk', async () => ({ name: 'Almacén Norte' }));
  t.mock.method(db.Client, 'findByPk', async () => ({ full_names: 'Cliente Norte' }));
  t.mock.method(company, 'getNumberDecimal', async () => 2);
  let pdfDocument;
  t.mock.method(pdf, 'sendReportPdf', async (res, document) => { pdfDocument = document; res.end(); });
  const controller = loadReportController();
  const req = { query: { ...filterParams }, userAuth: { full_names: 'Operador' } };
  await controller.generatePdfReports(req, responseMock());
  assert.ok(findOptions.where[Op.and].some(condition => condition.voucher === 'MAYOR. NACIONAL'));
  assert.equal(findOptions.order[0][0], 'date_output');
  const clientSearch = findOptions.include.find(include => include.association === 'client');
  assert.equal(clientSearch.where.full_names[Op.iLike], '%Cliente Norte%');
  assert.ok(pdfDocument);
  assert.equal(pdfDocument.reportTheme, 'recumet');
  assert.match(renderReportHtml(pdfDocument), /recumet-report/);
  assert.match(renderReportHtml(pdfDocument), /RECUMET/);
  assert.ok(pdfDocument.filters.includes('Tipo de venta: MAYOR. NACIONAL'));
  assert.ok(pdfDocument.filters.includes('Búsqueda (client.full_names): Cliente Norte'));
  assert.ok(pdfDocument.columns.some(column => column.label === 'TIPO DE VENTA'));
  assert.ok(pdfDocument.rows.some(row => row.cells.some(cell => cell.text === 'MAYOR. NACIONAL')));

  const chunks = [];
  const excelResponse = responseMock();
  excelResponse.on('data', chunk => chunks.push(chunk));
  await controller.generateExcelReports(req, excelResponse);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  const sheet = workbook.worksheets[0];
  const values = JSON.stringify(sheet.getSheetValues());
  assert.ok(values.includes('RECUMET S.R.L.'));
  for (const expected of ['MAYOR. NACIONAL', 'CONTADO', 'Cliente Norte', 'Almacén Norte', 'Búsqueda (client.full_names): Cliente Norte', 'Aluminio']) {
    assert.ok(values.includes(expected), expected);
  }
  assert.equal(sheet.getCell('A5').value, 'V-001');
  assert.equal(sheet.getCell('J5').value, 2.5);
  assert.equal(sheet.getCell('K5').value, 25.5);
  assert.equal(sheet.getCell('K6').value, 25.5);
});

test('PDF y Excel detallados aplican el tipo de venta y la búsqueda rápida', async t => {
  let detailOptions;
  t.mock.method(db.DetailsOutput, 'findAll', async options => {
    detailOptions = options;
    return [{ price: 10.2, product: { cod: 'P-1', name: 'Aluminio' }, dataValues: { suma_quantity: 2.5, suma_total: 25.5 } }];
  });
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Sucursal Norte', city: 'La Paz', company: { nit: '123' } }));
  t.mock.method(db.Storage, 'findByPk', async () => ({ name: 'Almacén Norte' }));
  t.mock.method(db.Client, 'findByPk', async () => ({ full_names: 'Cliente Norte' }));
  t.mock.method(company, 'getNumberDecimal', async () => 2);
  let detailPdfDocument;
  t.mock.method(pdf, 'sendReportPdf', async (res, document) => { detailPdfDocument = document; res.end(); });
  const controller = loadReportController();
  const req = { query: { ...filterParams }, userAuth: { full_names: 'Operador' } };
  await controller.generatePdfDetailsReports(req, responseMock());
  const reportOutput = detailOptions.include.find(include => include.association === 'output');
  assert.ok(reportOutput.where[Op.and].some(condition => condition.voucher === 'MAYOR. NACIONAL'));
  assert.equal(reportOutput.include[0].association, 'client');
  assert.equal(reportOutput.include[0].where.full_names[Op.iLike], '%Cliente Norte%');
  assert.ok(detailPdfDocument.filters.includes('Tipo de venta: MAYOR. NACIONAL'));
  assert.ok(detailPdfDocument.filters.includes('Búsqueda (client.full_names): Cliente Norte'));
  assert.equal(detailPdfDocument.reportTheme, 'recumet');
  assert.match(renderReportHtml(detailPdfDocument), /recumet-report/);
  assert.match(renderReportHtml(detailPdfDocument), /RECUMET/);

  const chunks = [];
  const excelResponse = responseMock();
  excelResponse.on('data', chunk => chunks.push(chunk));
  await controller.generateExcelDetailsReports(req, excelResponse);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  const sheet = workbook.worksheets[0];
  const values = JSON.stringify(sheet.getSheetValues());
  assert.ok(values.includes('Tipo de venta: MAYOR. NACIONAL'));
  assert.ok(values.includes('RECUMET S.R.L.'));
  assert.equal(sheet.getCell('A5').value, 'P-1');
  assert.equal(sheet.getCell('E5').value, 25.5);
  assert.equal(sheet.getCell('E6').value, 25.5);
});

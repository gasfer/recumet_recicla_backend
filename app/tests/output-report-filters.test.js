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
    id: 11, cod: 'V-001', date_output: '2026-10-20T10:00:00.000Z', type_registry: 'BOLETA', number_registry: '001',
    client: { full_names: 'Cliente Norte' }, voucher: 'MAYOR. NACIONAL', type_output: 'CONTADO',
    type_payment: 'EFECTIVO', comments: 'Venta de prueba', total: 25.5,
    detailsOutput: [
      { quantity: 2.5, product: { name: 'Aluminio', unit: { siglas: 'KG' } } },
      { quantity: 8, product: { name: 'Bolsa', unit: { siglas: 'PZA' } } },
    ],
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
  assert.deepEqual(outputOrder({ field_sort: 'date_output', order: 'ASC' }).order, [['date_output', 'ASC']]);
  assert.deepEqual(outputOrder({ field_sort: 'client.full_names', order: -1 }).order, [['client', 'full_names', 'DESC']]);
  assert.deepEqual(outputOrder({ field_sort: 'total_quantity', order: 1 }).sortByTotalQuantity, 'ASC');
  const listOrder = outputListOrder({ orderNew: ['total_quantity', 'ASC'] }, { literal: value => ({ val: value }) });
  assert.match(listOrder[0][0].val, /details_outputs/);
  assert.equal(listOrder[0][1], 'ASC');

  const sorted = sortOutputQuantities([{ id: 1, total_quantity: 2 }, { id: 2, total_quantity: 1 }], 'ASC');
  assert.deepEqual(sorted.map(row => row.total_quantity), [1, 2]);
});

test('el listado de ventas totaliza solo unidades de kilogramo y conserva los mismos filtros', async t => {
  let detailSumOptions;
  t.mock.method(db.Output, 'findAndCountAll', async () => ({
    count: 1,
    rows: [{ detailsOutput: [
      { quantity: 2.5, product: { unit: { siglas: 'KG' } } },
      { quantity: 8, product: { unit: { siglas: 'PZA' } } },
    ], dataValues: {} }],
  }));
  t.mock.method(db.Output, 'sum', async () => 25.5);
  t.mock.method(db.DetailsOutput, 'sum', async (_field, options) => { detailSumOptions = options; return 2.5; });
  const controller = require('../controllers/output.controller');
  const response = responseMock();
  await controller.getOutputsPaginate({ query: {
    page: '1', limit: '50', status: 'ACTIVE', filterBy: 'DAY', date1: '20-10-2026',
    id_sucursal: '1', id_storage: '2', type_pay: 'CONTADO',
  } }, response);
  assert.equal(response.body.outputs.data[0].dataValues.total_quantity, 2.5);
  assert.equal(response.body.outputs.totals.totalQuantity, 2.5);
  assert.ok(detailSumOptions.include.some(include => include.association === 'product' && include.required));
});

test('PDF y Excel generales aplican los filtros seleccionados y exportan las filas filtradas', async t => {
  let findOptions;
  t.mock.method(db.Output, 'findAll', async options => {
    findOptions = options;
    return [outputFixture(), {
      ...outputFixture(), id: 12, cod: 'V-002', total: 0.1,
      detailsOutput: [{ quantity: 0.2, product: { name: 'Cobre', unit: { siglas: 'KG' } } }],
    }];
  });
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
  assert.deepEqual(pdfDocument.columns.map(column => column.label), [
    'N.º', 'CÓDIGO', 'FECHA DE VENTA', 'TIPO DE DOCUMENTO', 'N.º DE DOCUMENTO', 'CLIENTE',
    'TIPO DE VENTA', 'CONDICIÓN DE PAGO', 'MEDIO DE PAGO', 'DETALLE', 'OBSERVACIONES', 'CANTIDAD (KG)', 'TOTAL Bs',
  ]);
  assert.ok(pdfDocument.rows.some(row => row.cells.some(cell => cell.text === 'MAYOR. NACIONAL')));
  assert.equal(pdfDocument.rows[0].cells[0].text, '1');
  assert.equal(pdfDocument.rows[1].cells[0].text, '2');
  assert.match(pdfDocument.rows.at(-1).cells.at(-2).text, /2,70 kg/);
  assert.match(pdfDocument.rows.at(-1).cells.at(-1).text, /25,60/);

  const chunks = [];
  const excelResponse = responseMock();
  excelResponse.on('data', chunk => chunks.push(chunk));
  await controller.generateExcelReports(req, excelResponse);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  const sheet = workbook.worksheets[0];
  assert.deepEqual(
    pdfDocument.columns.map(column => column.label.toLocaleLowerCase('es')),
    sheet.getRow(4).values.slice(1).map(value => String(value).toLocaleLowerCase('es')),
  );
  const values = JSON.stringify(sheet.getSheetValues());
  assert.ok(values.includes('RECUMET S.R.L.'));
  for (const expected of ['MAYOR. NACIONAL', 'CONTADO', 'Cliente Norte', 'Almacén Norte', 'Búsqueda (client.full_names): Cliente Norte', 'Aluminio']) {
    assert.ok(values.includes(expected), expected);
  }
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('B5').value, 'V-001');
  assert.equal(sheet.getCell('I5').value, 'EFECTIVO');
  assert.equal(sheet.getCell('L5').value, 2.5);
  assert.equal(sheet.getCell('M5').value, 25.5);
  assert.equal(sheet.getCell('A6').value, 2);
  assert.equal(sheet.getCell('M6').value, 0.1);
  assert.equal(sheet.getCell('L7').value, 2.7);
  assert.equal(sheet.getCell('M7').value, 25.6);
});

test('PDF y Excel detallados aplican el tipo de venta y la búsqueda rápida', async t => {
  let detailOptions;
  t.mock.method(db.DetailsOutput, 'findAll', async options => {
    detailOptions = options;
    return [
      { price: 10.2, product: { cod: 'P-1', name: 'Aluminio', unit: { id: 2, siglas: 'KG' } }, dataValues: { suma_quantity: 2.5, suma_total: 25.5 } },
      { price: 0.4, product: { cod: 'P-2', name: 'Bolsa', unit: { id: 4, siglas: 'PZA' } }, dataValues: { suma_quantity: 1, suma_total: 0.4 } },
    ];
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
  assert.equal(detailOptions.include[0].include[0].association, 'unit');
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
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('B5').value, 'P-1');
  assert.equal(sheet.getCell('G5').value, 25.5);
  assert.equal(sheet.getCell('A6').value, 2);
  assert.equal(sheet.getCell('B6').value, 'P-2');
  assert.equal(sheet.getCell('G6').value, 0.4);
  assert.equal(sheet.getCell('A7').value, 'TOTALES POR UNIDAD');
  assert.equal(sheet.getCell('F7').value, 'KG: 2,50 · PZA: 1,00');
  assert.equal(sheet.getCell('G7').value, 25.9);
  assert.equal(detailPdfDocument.rows[0].cells[0].text, '1');
  assert.equal(detailPdfDocument.rows[1].cells[0].text, '2');
  assert.equal(detailPdfDocument.columns.length, 7);
  assert.equal(detailPdfDocument.rows.at(-1).cells.at(-2).text, 'KG: 2,50 · PZA: 1,00');
});

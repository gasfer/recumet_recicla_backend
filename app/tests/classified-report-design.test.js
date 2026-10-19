'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');
const db = require('../database/config');
const company = require('../helpers/company');
const pdf = require('../services/pdf/report-pdf.service');
const { renderReportHtml } = require('../helpers/generator-pdf/report-html.template');

test('las cuatro exportaciones comparten logo, encabezado, filtros y colores RECUMET', async t => {
  t.mock.method(company, 'getNumberDecimal', async () => 2);
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Casa Matriz', city: 'Cochabamba', cellphone: '70000123', company: { nit: '123456', email: 'info@example.com' } }));
  for (const [model, label] of [[db.Storage, 'Principal'], [db.Category, 'Metales'], [db.Product, 'Aluminio']]) t.mock.method(model, 'findAll', async () => [{ name: label }]);
  t.mock.method(db.Classified, 'findAll', async () => [{ cod: 'CL001', date_classified: '2026-10-12T15:00:00Z', type_registry: 'BOLETA', number_registry: '0012', scale: { name: 'Balanza' }, comments: 'Detalle completo', product: { name: 'MP001 - Aluminio' }, cost_product: 2.25, quantity_product: 120 }]);
  t.mock.method(db.DetailsClassified, 'findAll', async () => [{ product: { cod: 'PT001', name: 'Aluminio clasificado' }, cost: 2.25, dataValues: { suma_quantity: 120 } }]);
  let document;
  t.mock.method(pdf, 'sendReportPdf', async (res, value) => { document = value; res.end(); });
  const controller = require('../controllers/reports/classified.controller');
  const req = { query: { filterBy: 'MONTH', date1: '10', date2: '2026', id_sucursal: '1', id_storage: '2', category_ids: '3', product_ids: '4', status: 'ACTIVE', type_registry: 'BOLETA' }, userAuth: { full_names: 'Operador' } };
  for (const handler of ['generateExcelReports', 'generateExcelDetailsReports', 'generatePdfReports', 'generatePdfDetailsReports']) {
    await t.test(handler, async () => {
      const chunks = []; const res = new PassThrough(); res.on('data', c => chunks.push(c)); res.setHeader = () => {};
      res.status = code => { assert.fail('HTTP ' + code); };
      await controller[handler](req, res);
      if (handler.includes('Excel')) {
        const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.concat(chunks));
        const sheet = book.worksheets[0]; const text = JSON.stringify(sheet.getSheetValues());
        for (const word of ['CLASIFICADOS', 'Casa Matriz', 'octubre de 2026', 'Metales', 'Aluminio', 'Principal', 'BOLETA']) assert.ok(text.includes(word), word);
        assert.ok(sheet.getImages().length);
        assert.match(sheet.getCell('B1').value, /Cochabamba/);
        assert.match(sheet.getCell('B1').value, /NIT: 123456/);
        assert.match(sheet.getCell('C2').value, /Sucursal: Casa Matriz/);
        assert.match(sheet.getCell('A3').value, /Período: octubre de 2026/);
        assert.equal(sheet.getCell('A3').alignment.wrapText, true);
        assert.equal(sheet.getCell('A3').fill.fgColor.argb, 'FFE3F3EA');
        assert.equal(sheet.getRow(sheet.views[0].ySplit).getCell(1).fill.fgColor.argb, 'FF1E5B3A');
        assert.equal(Number(String(sheet.autoFilter).match(/\d+$/)[0]), sheet.views[0].ySplit + 1);
        assert.equal(sheet.getRow(sheet.views[0].ySplit + 1).height, 17);
      } else {
        const html = renderReportHtml(document);
        for (const word of ['recumet-report', 'RECUMET', 'Casa Matriz', 'Cochabamba', '123456', '70000123', 'Metales', 'Aluminio', 'Principal', 'octubre de 2026']) assert.ok(html.includes(word), word);
        assert.ok(html.includes('.recumet-report th{background:#1E5B3A;color:#FFFFFF}'));
        assert.ok(document.rows.length > 1);
      }
    });
  }
});

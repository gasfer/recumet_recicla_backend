const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const { summarizeByProduct } = require('../services/purchase-report-query.service');
const { buildDetailedPdfBody, buildDetailedCppPdfBody } = require('../controllers/purchase-report.controller');

const fixtureInputs = () => [
  {
    id: 1, cod: 'COMP00001', date_voucher: '2026-09-01T10:00:00', type_registry: 'BOLETA',
    detailsInput: [
      { quantity: 10, total: 100, product: { id: 5, cod: 'MP-5', name: 'Material 5' } },
      { quantity: 20, total: 200, product: { id: 6, cod: 'MP-6', name: 'Material 6' } },
    ],
  },
  {
    id: 2, cod: 'COMP00002', date_voucher: '2026-09-02T10:00:00', type_registry: 'BOLETA',
    detailsInput: [
      { quantity: 5, total: 50, product: { id: 5, cod: 'MP-5', name: 'Material 5' } },
    ],
  },
];

test('resume por producto suma cantidades y totales agrupando por producto', () => {
  const summary = summarizeByProduct(fixtureInputs());
  assert.equal(summary.length, 2);
  const material5 = summary.find((row) => row.cod === 'MP-5');
  assert.equal(material5.quantity, 15);
  assert.equal(material5.total, 150);
});

test('el PDF de resumen por producto conserva columnas, numeración y total', () => {
  const body = buildDetailedPdfBody(fixtureInputs(), 2);
  assert.equal(body[0].length, 4);
  assert.equal(body[1][0].text, '1');
  assert.equal(body.at(-1)[0].text, 'TOTAL');
  assert.equal(body.at(-1)[3].text, '35.00');
});

test('el PDF detallado CPP calcula costo promedio ponderado y totales', () => {
  const body = buildDetailedCppPdfBody(fixtureInputs(), 2);
  assert.equal(body[0].length, 5);
  const material5 = body.find((row) => row[0].text === 'MP-5');
  assert.equal(material5[2].text, '10.00');
  assert.equal(material5[3].text, '15.00');
  assert.equal(material5[4].text, '150.00');
  assert.equal(body.at(-1)[0].text, 'TOTAL');
  assert.equal(body.at(-1)[3].text, '35.00');
  assert.equal(body.at(-1)[4].text, '350.00');
});

test('las exportaciones detalladas aisladas no alteran los resúmenes por proveedor', () => {
  const { buildPurchaseReportPdfBody } = require('../controllers/purchase-report.controller');
  const body = buildPurchaseReportPdfBody([{
    cod: 'COMP00001', date_voucher: '2026-09-01T10:00:00', type_registry: 'BOLETA', registry_number: '100',
    type: 'CONTADO', total_quantity: 15, total: 150, provider: { full_names: 'Proveedor A', type: { name: 'MAYORISTA' } },
    detailsInput: [{ quantity: 15, total: 150, product: { id: 5, cod: 'MP-5', name: 'Material 5', unit: { siglas: 'KGR' } } }],
  }], 2);
  assert.equal(body[0].length, 10);
  assert.match(body[1][0].text, /PROVEEDOR: Proveedor A/);
  assert.equal(body.at(-1)[0].text, 'TOTAL GENERAL');
});
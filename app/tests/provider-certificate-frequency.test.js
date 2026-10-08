'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { certificateExtension, uploadCertificate } = require('../controllers/provider-certificate.controller');
const controller = require('../controllers/provider.controller');
const frequencyService = require('../services/provider-frequency.service');
const { Provider } = require('../database/config');
const fs = require('fs/promises');

const response = () => ({ code: 200, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });

test('certificado admite firmas reales de PDF, PNG y JPG hasta 8 MB', () => {
  assert.equal(certificateExtension({ mimetype: 'application/pdf', data: Buffer.from('%PDF-1.7'), size: 8 }), '.pdf');
  assert.equal(certificateExtension({ mimetype: 'image/png', data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), size: 8 }), '.png');
  assert.equal(certificateExtension({ mimetype: 'image/jpeg', data: Buffer.from([255, 216, 255]), size: 3 }), '.jpg');
  assert.equal(certificateExtension({ mimetype: 'image/png', data: Buffer.from('invalid'), size: 7 }), null);
  assert.equal(certificateExtension({ mimetype: 'application/pdf', data: Buffer.from('%PDF'), size: 9 * 1024 * 1024 }), null);
});

test('guarda el certificado contra el proveedor y devuelve confirmación', async t => {
  let saved;
  let destination;
  t.mock.method(Provider, 'findByPk', async () => ({ id: 7, update: async values => { saved = values; } }));
  t.mock.method(fs, 'mkdir', async () => {});
  const file = { name: 'certificado.pdf', mimetype: 'application/pdf', data: Buffer.from('%PDF-1.7'), size: 8, mv: async value => { destination = value; } };
  const res = response();
  await uploadCertificate({ params: { id: 7 }, files: { document: file } }, res);
  assert.equal(res.code, 201);
  assert.match(saved.certificate_file_name, /^[\w-]+\.pdf$/);
  assert.ok(destination.endsWith(saved.certificate_file_name));
  assert.equal(res.body.certificate_file_name, saved.certificate_file_name);
});

test('el contrato del análisis incluye los campos que consume la sugerencia automática', async t => {
  t.mock.method(frequencyService, 'calculateFrequency', async () => ({
    hasSufficientHistory: true, totalDeliveries: 4, averageDays: 7, frequencyCode: 'WEEKLY', lastDeliveryDate: '2026-10-01', nextEstimatedDate: '2026-10-08',
  }));
  const res = response();
  await controller.getProviderFrequencyAnalysis({ params: { id: 7 }, query: { id_product: 10 } }, res);
  assert.equal(res.body.analysis.has_sufficient_history, true);
  assert.equal(res.body.analysis.frequency, 'WEEKLY');
  assert.equal(res.body.analysis.total_deliveries, 4);
  assert.equal(res.body.analysis.last_delivery_date, '2026-10-01');
  assert.equal(res.body.analysis.frequencyCode, 'WEEKLY');
});

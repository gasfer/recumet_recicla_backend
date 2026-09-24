'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const historicalService = require('../services/historical-transfer-difference.service');
const {
  previewHistoricalDifferenceCompletion,
  completeHistoricalDifference,
} = require('../controllers/transfer_review_notes.controller');

const responseRecorder = () => {
  const result = {};
  return {
    result,
    response: {
      status(status) {
        result.status = status;
        return { json(body) { result.body = body; return body; } };
      },
    },
  };
};

test('rechaza la previsualización de una sucursal no autorizada antes de consultar la conciliación', async (t) => {
  let serviceCalls = 0;
  t.mock.method(db.Transfers, 'findByPk', async () => ({ id: 44, id_sucursal_received: 7 }));
  t.mock.method(historicalService, 'previewCompletion', async () => { serviceCalls += 1; });
  const { result, response } = responseRecorder();
  await previewHistoricalDifferenceCompletion({
    params: { id_transfer: '44', detail_id: '1' },
    query: {},
    userAuth: { id: 9, role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 2 }] },
  }, response);
  assert.equal(result.status, 403);
  assert.equal(serviceCalls, 0);
});

test('la confirmación propaga huella, motivo, producto MERMAS e idempotencia', async (t) => {
  let received;
  t.mock.method(db.Transfers, 'findByPk', async () => ({ id: 44, id_sucursal_received: 2 }));
  t.mock.method(historicalService, 'completeDifference', async (params) => {
    received = params;
    return { idempotent: false, completion: { id: 5 } };
  });
  const { result, response } = responseRecorder();
  await completeHistoricalDifference({
    params: { id_transfer: '44', detail_id: '1' },
    body: { id_merma_product: 22, preview_fingerprint: 'fingerprint-1', reason: 'Registro verificado' },
    header: () => 'historical-request-1',
    userAuth: { id: 9, role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 2 }] },
  }, response);
  assert.equal(result.status, 201);
  assert.deepEqual(received, {
    transferId: 44,
    detailId: 1,
    mermaProductId: 22,
    previewFingerprint: 'fingerprint-1',
    reason: 'Registro verificado',
    idempotencyKey: 'historical-request-1',
    actorUserId: 9,
  });
});


'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const documentaryService = require('../services/transfer-review-documentary.service');
const { authorizeTransferReview } = require('../middlewares/authorize-transfer-review');
const { getStockAvailability } = require('../services/stock-availability.service');
const { documentaryCloseReviewDetail } = require('../controllers/transfer_review_notes.controller');

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

test('el permiso operativo concilia, pero no habilita el endpoint correctivo administrativo', (t) => {
  const userAuth = {
    role: 'OPERADOR',
    assign_permission: [{ module: 'TRANSFER_REVIEW', status: true, update: true, reports: false }],
  };
  const operational = responseRecorder();
  let nextCalls = 0;
  authorizeTransferReview('resolve')({ userAuth }, operational.response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);

  const corrective = responseRecorder();
  authorizeTransferReview('approve')({ userAuth }, corrective.response, () => { nextCalls += 1; });
  assert.equal(corrective.result.status, 403);
  assert.equal(nextCalls, 1);
});

test('rechaza la conciliacion antes del servicio cuando la boleta pertenece a otra sucursal', async (t) => {
  let serviceCalls = 0;
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => ({ id: 41, id_sucursal: 7 }));
  t.mock.method(documentaryService, 'documentaryCloseDetail', async () => { serviceCalls += 1; });
  const { result, response } = responseRecorder();

  await documentaryCloseReviewDetail({
    params: { id: '41', detail_id: '51' },
    body: {},
    header: () => 'isolation-key',
    userAuth: {
      id: 9,
      role: 'OPERADOR',
      assign_sucursales: [{ id_sucursal: 2 }],
    },
  }, response);

  assert.equal(result.status, 403);
  assert.equal(serviceCalls, 0);
});

test('genera la clave idempotente cuando el cliente o un intermediario no la envia', async (t) => {
  let receivedKey = '';
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => ({ id: 41, id_sucursal: 2 }));
  t.mock.method(documentaryService, 'documentaryCloseDetail', async ({ idempotencyKey }) => {
    receivedKey = idempotencyKey;
    return { idempotent: false };
  });
  const { result, response } = responseRecorder();

  await documentaryCloseReviewDetail({
    params: { id: '41', detail_id: '51' },
    body: {},
    header: () => undefined,
    userAuth: {
      id: 9,
      role: 'OPERADOR',
      assign_sucursales: [{ id_sucursal: 2 }],
    },
  }, response);

  assert.equal(result.status, 201);
  assert.match(receivedKey, /^[0-9a-f-]{36}$/i);
});

test('la disponibilidad descuenta retenciones activas aun despues del cierre documental', async (t) => {
  let queryText = '';
  t.mock.method(db.sequelize, 'query', async (sql) => {
    queryText = sql;
    return [{ id_product: 3, id_sucursal: 2, id_storage: 4, quantity_in_review: '10.0000' }];
  });

  const availability = await getStockAvailability({
    id_product: 3,
    id_sucursal: 2,
    id_storage: 4,
    stock: '100.0000',
  });

  assert.deepEqual(availability, { physical_stock: 100, stock_in_review: 10, available_stock: 90 });
  assert.match(queryText, /transfer_review_inventory_holds/);
  assert.match(queryText, /disposition <> 'LIBERADO_POR_AJUSTE'/);
  assert.doesNotMatch(queryText, /reconciliation_status/);
});

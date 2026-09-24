'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const cancellationService = require('../services/transfer-cancellation.service');
const notificationService = require('../services/notification.service');
const { authorizeTransferCancellation } = require('../middlewares/authorize-transfer-cancellation');
const { validateIdTransferPending, validateReceptionCancellation } = require('../middlewares/validators/transfers');
const { cancelReception } = require('../controllers/transfers.controller');
const router = require('../routes/transfers');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('la ruta separada de anulación de recepción exige autorización administrativa', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/reception/:id_transfer/cancel');
  assert.ok(route);
  assert.equal(route.route.methods.post, true);
  assert.ok(route.route.stack.some((layer) => layer.handle === authorizeTransferCancellation));
});

test('la anulación de recepción delega al comando en una transacción', async (t) => {
  const sequence = [];
  const transaction = { commit: async () => { sequence.push('commit'); }, rollback: async () => undefined };
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(notificationService, 'notifyAdmins', async () => undefined);
  let received;
  t.mock.method(cancellationService, 'cancelReceivedTransfer', async (input) => {
    sequence.push('service-verified');
    received = input;
    return { notification: { title: 'Recepción anulada' } };
  });
  const res = response();

  await cancelReception({ params: { id_transfer: '12' }, body: { reason: 'Corrección administrativa' }, userAuth: { id: 3 } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(sequence, ['service-verified', 'commit']);
  assert.deepEqual(received, {
    transferId: '12',
    actorUserId: 3,
    reason: 'Corrección administrativa',
    transaction,
  });
});

test('un desfase Stock–Kardex revierte toda la solicitud y no notifica', async (t) => {
  let commits = 0;
  let rollbacks = 0;
  let notifications = 0;
  const transaction = {
    commit: async () => { commits += 1; },
    rollback: async () => { rollbacks += 1; },
  };
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(notificationService, 'notifyAdmins', async () => { notifications += 1; });
  t.mock.method(cancellationService, 'cancelReceivedTransfer', async () => {
    throw Object.assign(new Error('Stock y Kardex no terminan con el mismo saldo.'), {
      statusCode: 409,
      code: 'STOCK_KARDEX_PARITY_VIOLATION',
      details: [{ product_id: 8, sucursal_id: 2, storage_id: 5, difference: 1 }],
    });
  });
  const res = response();

  await cancelReception({ params: { id_transfer: '12' }, body: { reason: 'Corrección administrativa' }, userAuth: { id: 3 } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'STOCK_KARDEX_PARITY_VIOLATION');
  assert.equal(commits, 0);
  assert.equal(rollbacks, 1);
  assert.equal(notifications, 0);
});

test('una recepción bloqueada hace rollback y no genera notificación', async (t) => {
  let rolledBack = false;
  let notifications = 0;
  const transaction = { commit: async () => undefined, rollback: async () => { rolledBack = true; } };
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(notificationService, 'notifyAdmins', async () => { notifications += 1; });
  t.mock.method(cancellationService, 'cancelReceivedTransfer', async () => {
    const error = Object.assign(new Error('La recepción tiene pendientes.'), {
      statusCode: 409,
      code: 'TRANSFER_CANCELLATION_REJECTED',
      details: { blockers: [{ type: 'OPEN_REVIEW_DETAILS', count: 1 }] },
    });
    throw error;
  });
  const res = response();

  await cancelReception({ params: { id_transfer: '12' }, body: { reason: 'Corrección administrativa' }, userAuth: { id: 3 } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(rolledBack, true);
  assert.equal(notifications, 0);
  assert.equal(res.body.errors[0].details.blockers[0].type, 'OPEN_REVIEW_DETAILS');
});

test('la baja ordinaria continúa limitada a traslados pendientes', () => {
  const route = router.stack.find((layer) => layer.route?.path === '/destroy/:id_transfer');
  const routeHandles = route.route.stack.map((layer) => layer.handle);
  const receivedRoute = router.stack.find((layer) => layer.route?.path === '/reception/:id_transfer/cancel');
  const receivedHandles = receivedRoute.route.stack.map((layer) => layer.handle);

  assert.ok(validateIdTransferPending.flat().every((middleware) => routeHandles.includes(middleware)));
  assert.ok(validateReceptionCancellation.flat().every((middleware) => receivedHandles.includes(middleware)));
  assert.equal(route.route.methods.delete, true);
  assert.equal(receivedRoute.route.methods.post, true);
});

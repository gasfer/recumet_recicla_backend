'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const db = require('../database/config'); const service = require('../services/transfer-cancellation.service'); const { deleteTransfer } = require('../controllers/transfers.controller');
test('la baja pendiente delega al servicio transaccional y conserva la respuesta', async (t) => {
  const transaction = { commit: async () => undefined, rollback: async () => undefined };
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  let received; t.mock.method(service, 'cancelPendingTransfer', async (input) => { received = input; return { idempotent: false }; });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await deleteTransfer({ params: { id_transfer: '7' }, userAuth: { id: 3 } }, res);
  assert.equal(res.code, 201); assert.deepEqual(received, { transferId: '7', actorUserId: 3, transaction });
});

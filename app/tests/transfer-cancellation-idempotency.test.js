'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const db = require('../database/config'); const { cancelPendingTransfer } = require('../services/transfer-cancellation.service');
test('un reintento de baja ya confirmada no crea otro efecto', async (t) => {
  const cancelled = { id: 7, status: 'ANULADO' };
  t.mock.method(db.Transfers, 'findOne', async ({ where }) => where.status === 'ANULADO' ? cancelled : null);
  const result = await cancelPendingTransfer({ transferId: 7, actorUserId: 1, transaction: { LOCK: { UPDATE: 'UPDATE' } } });
  assert.equal(result.idempotent, true); assert.equal(result.transfer, cancelled);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const bulk = require('../services/bulk-transfer-review-reconciliation.service');
const automatic = require('../services/automated-transfer-review-resolution.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

const setup = (t, details = [{ id: 2 }, { id: 7 }]) => {
  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => ({ id: 11 }));
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async () => details);
};

test('previsualiza todos los detalles seleccionados y conserva los errores por ítem', async (t) => {
  setup(t);
  t.mock.method(automatic, 'preview', async ({ detailId }) => detailId === 2
    ? { status: 'READY' }
    : (() => { throw new Error('El detalle ya tiene un registro vigente.'); })());

  const result = await bulk.preview({ noteId: 11, items: [{ detail_id: 2 }, { detail_id: 7 }] });
  assert.equal(result.ready, false);
  assert.equal(result.items[0].preview.status, 'READY');
  assert.match(result.items[1].error, /registro vigente/);
});

test('rechaza una selección que mezcla detalles de otra boleta antes de crear efectos', async (t) => {
  setup(t, [{ id: 2 }]);
  t.mock.method(automatic, 'confirmInTransaction', async () => {
    throw new Error('No debe ejecutarse');
  });

  await assert.rejects(
    bulk.confirm({ noteId: 11, items: [{ detail_id: 2 }, { detail_id: 7 }], idempotencyKey: 'grupo-ajeno', actorUserId: 3 }),
    /misma boleta/,
  );
});

test('confirma en orden estable y reutiliza claves derivadas por detalle', async (t) => {
  setup(t);
  const calls = [];
  t.mock.method(automatic, 'confirmInTransaction', async (payload) => {
    calls.push(payload);
    return { action: { id: payload.detailId }, idempotent: false, pending_quantity: 0 };
  });

  const result = await bulk.confirm({
    noteId: 11,
    items: [
      { detail_id: 7, solution_code: 'CONFIRM_DIFFERENCE', reason_code: 'DIFERENCIA_BALANZAS', operational_justification: 'Validación agrupada correcta', document_references: [], id_authorizer_user: 3, quantity: 2 },
      { detail_id: 2, solution_code: 'CONFIRM_DIFFERENCE', reason_code: 'DIFERENCIA_BALANZAS', operational_justification: 'Validación agrupada correcta', document_references: [], id_authorizer_user: 3, quantity: 1 },
    ],
    idempotencyKey: 'grupo-11', actorUserId: 3,
  });

  assert.deepEqual(calls.map(({ detailId }) => detailId), [2, 7]);
  assert.deepEqual(calls.map(({ idempotencyKey }) => idempotencyKey), ['grupo-11:2', 'grupo-11:7']);
  assert.equal(result.items.length, 2);
  assert.equal(result.idempotent, false);
});

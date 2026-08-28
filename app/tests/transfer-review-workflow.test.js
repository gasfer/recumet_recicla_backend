'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const notificationService = require('../services/notification.service');

const {
  deriveReconciliationStatus,
  deriveReceptionStatus,
  assignReview,
} = require('../services/transfer-review-workflow.service');

test('deriva EN_REVISION cuando ningún detalle fue conciliado', () => {
  assert.equal(deriveReconciliationStatus([
    { reconciliation_status: 'EN_REVISION', quantity_resolved: 0 },
  ]), 'EN_REVISION');
});

test('deriva PARCIAL cuando existe una resolución parcial o un detalle completado', () => {
  assert.equal(deriveReconciliationStatus([
    { reconciliation_status: 'EN_REVISION', quantity_resolved: 2 },
    { reconciliation_status: 'EN_REVISION', quantity_resolved: 0 },
  ]), 'PARCIAL');
  assert.equal(deriveReconciliationStatus([
    { reconciliation_status: 'COMPLETADO', quantity_resolved: 5 },
    { reconciliation_status: 'EN_REVISION', quantity_resolved: 0 },
  ]), 'PARCIAL');
});

test('deriva COMPLETADO sólo cuando todos los detalles están completos', () => {
  assert.equal(deriveReconciliationStatus([
    { reconciliation_status: 'COMPLETADO', quantity_resolved: 5 },
    { reconciliation_status: 'COMPLETADO', quantity_resolved: 2 },
  ]), 'COMPLETADO');
});

test('una recepción exacta sin notas está COMPLETADA', () => {
  assert.equal(deriveReceptionStatus([]), 'COMPLETADO');
});

test('la recepción refleja estado parcial y pendiente de sus notas', () => {
  assert.equal(deriveReceptionStatus([
    { reconciliation_status: 'COMPLETADO' },
    { reconciliation_status: 'EN_REVISION' },
  ]), 'PARCIAL');
  assert.equal(deriveReceptionStatus([{ reconciliation_status: 'EN_REVISION' }]), 'EN_REVISION');
});

test('una conciliación eliminada no mantiene la recepción en estado pendiente', () => {
  assert.equal(deriveReceptionStatus([
    { reconciliation_status: 'EN_REVISION', management_status: 'ELIMINADA' },
  ]), 'COMPLETADO');
});

test('la derivación registra responsable, observación, actor y fecha antes de conciliar', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const note = {
    id: 44,
    registry_number: 'NTR-000044',
    id_assigned_user: null,
    assigned_at: null,
    save: async () => note,
  };
  const assignedUser = { id: 17, full_names: 'Responsable operativo' };
  const events = [];

  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(db.TransferReviewNote, 'findByPk', async (id, options) => {
    assert.equal(id, note.id);
    assert.equal(options.lock, transaction.LOCK.UPDATE);
    return note;
  });
  t.mock.method(db.User, 'findOne', async () => assignedUser);
  t.mock.method(db.TransferReviewEvent, 'create', async (values) => {
    events.push(values);
    return { id: 101, ...values };
  });
  t.mock.method(notificationService, 'notifyTransferReviewStakeholders', async () => undefined);

  await assignReview({
    noteId: note.id,
    assignedUserId: assignedUser.id,
    observation: 'Verificar nuevamente el pesaje de destino.',
    actorUserId: 9,
  });

  assert.equal(note.id_assigned_user, assignedUser.id);
  assert.equal(note.assigned_at instanceof Date, true);
  assert.equal(events[0].event_type, 'ASIGNADA');
  assert.equal(events[0].id_user, 9);
  assert.equal(events[0].metadata.assigned_user_id, assignedUser.id);
  assert.equal(events[0].metadata.assignment_observation, 'Verificar nuevamente el pesaje de destino.');
  assert.match(events[0].description, /verificar nuevamente el pesaje/i);
});

test('la derivación sin observación válida se rechaza antes de modificar la nota', async () => {
  await assert.rejects(() => assignReview({
    noteId: 44,
    assignedUserId: 17,
    observation: '   ',
    actorUserId: 9,
  }), /observación.*al menos 5 caracteres/i);
});

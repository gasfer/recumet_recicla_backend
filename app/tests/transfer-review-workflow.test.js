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

test('3.4 getTransferTraceability enriquece medición, normal, bloqueada y efectos aplicados', async (t) => {
  const { getTransferTraceability } = require('../services/transfer-review-workflow.service');
  const availabilityService = require('../services/stock-availability.service');
  const historicalService = require('../services/historical-transfer-difference.service');

  t.mock.method(availabilityService, 'getStockKardexIrregularities', async () => []);
  t.mock.method(historicalService, 'getProjection', async () => null);

  const mockTransfer = {
    id: 10,
    cod: 'TRAS00010',
    registry_number: 'NTR-00010',
    id_sucursal_received: 2,
    id_storage_received: 3,
    detailsTransfers: [
      {
        id: 1,
        quantity: 100,
        quantity_received: 100.5,
        tolerance_decision: 'ACCEPTED',
        receipt_difference_percentage: 0.5,
        accounting_status: 'CONTABILIZADO',
      },
      {
        id: 2,
        id_product: 22,
        quantity: 100,
        quantity_received: 110,
        tolerance_decision: 'REQUIRES_REVIEW',
        receipt_difference_percentage: 10,
        accounting_status: 'PENDIENTE_CONCILIACION',
      },
      {
        id: 3,
        id_product: 33,
        quantity: 26.5,
        quantity_received: 21,
        tolerance_decision: 'REQUIRES_REVIEW',
        receipt_difference_percentage: -20.75,
        accounting_status: 'PENDIENTE_CONCILIACION',
      },
    ],
    reviewNotes: [
      {
        id: 5,
        registry_number: 'NTR-00005',
        type: 'EXCEDENTE_PARA_REVISION',
        reconciliation_status: 'COMPLETADO',
        resolutionActions: [
          {
            id: 20,
            strategy: 'TRANSFER_RETURN',
            quantity: 10,
            operation_type: 'TRANSFER',
            operation_id: 45,
          },
        ],
        details: [
          {
            id: 8,
            id_detail_transfer: 2,
            quantity_sent: 100,
            quantity_received: 110,
            quantity_difference: 10,
            quantity_resolved: 10,
            reconciliation_status: 'COMPLETADO',
            inventoryHolds: [{
              disposition: 'RETENIDO_SIN_AJUSTE',
              quantity: 10,
              id_product: 22,
            }],
          },
        ],
      },
      {
        id: 6,
        registry_number: 'NTR-00006',
        type: 'FALTANTE_PARA_REVISION',
        reconciliation_status: 'EN_REVISION',
        resolutionActions: [],
        details: [{
          id: 9,
          id_detail_transfer: 3,
          quantity_sent: 26.5,
          quantity_received: 21,
          quantity_difference: 5.5,
          quantity_resolved: 0,
          reconciliation_status: 'EN_REVISION',
          // Esta retención pertenece al producto Merma, no al radiador recibido.
          inventoryHolds: [{ disposition: 'EN_REVISION', quantity: 5.5, id_product: 99 }],
        }],
      },
    ],
    toJSON() { return this; },
  };

  t.mock.method(db.Transfers, 'findByPk', async () => mockTransfer);

  const traceability = await getTransferTraceability(10);

  assert.equal(traceability.id, 10);
  assert.equal(traceability.detailsTransfers.length, 3);

  // Item dentro de tolerancia
  const acceptedItem = traceability.detailsTransfers[0];
  assert.equal(acceptedItem.quantity_sent, 100);
  assert.equal(acceptedItem.quantity_physical_received, 100.5);
  assert.equal(acceptedItem.quantity_normal_received, 100.5);
  assert.equal(acceptedItem.quantity_blocked_difference, 0);
  assert.equal(acceptedItem.quantity_held, 0);
  assert.equal(acceptedItem.quantity_available, 100.5);
  assert.equal(acceptedItem.inventory_integrity, 'INTEGRA');
  assert.equal(acceptedItem.tolerance_decision, 'ACCEPTED');

  // Item fuera de tolerancia
  const reviewItem = traceability.detailsTransfers[1];
  assert.equal(reviewItem.quantity_sent, 100);
  assert.equal(reviewItem.quantity_physical_received, 110);
  assert.equal(reviewItem.quantity_normal_received, 100);
  assert.equal(reviewItem.quantity_blocked_difference, 10);
  assert.equal(reviewItem.quantity_held, 10);
  assert.equal(reviewItem.quantity_available, 100);
  assert.equal(reviewItem.inventory_integrity, 'INTEGRA');
  assert.equal(reviewItem.receipt_difference_percentage, 10);
  assert.equal(reviewItem.tolerance_decision, 'REQUIRES_REVIEW');

  // Un faltante no retiene el producto físico recibido: la retención es de Merma.
  const shortageItem = traceability.detailsTransfers[2];
  assert.equal(shortageItem.is_shortage, true);
  assert.equal(shortageItem.quantity_shortage_pending, 5.5);
  assert.equal(shortageItem.quantity_held, 0);
  assert.equal(shortageItem.quantity_available, 21);

  // Acción con efecto aplicado
  const note = traceability.reviewNotes[0];
  assert.equal(note.registry_number, 'NTR-00005');
  assert.equal(note.resolutionActions[0].specific_effect, 'REVERTIR');
  assert.equal(note.resolutionActions[0].applied_effect, 'REVERTIR');
});

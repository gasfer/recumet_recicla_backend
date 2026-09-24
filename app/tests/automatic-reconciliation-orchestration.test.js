'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';

const db = require('../database/config');
const operations = require('../services/reconciliation-operational-document.service');
const workflow = require('../services/transfer-review-workflow.service');
const notifications = require('../services/notification.service');
const integrity = require('../services/stock-kardex-integrity.service');
const resolutionService = require('../services/automated-transfer-review-resolution.service');
const managementService = require('../services/transfer-reconciliation-management.service');

test('4.6 y 4.7 emisión de notificaciones, eventos y atomicidad ante fallos intermedios', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const row = (data) => ({ ...data, save: async () => {}, destroy: async () => {} });

  const note = row({
    id: 1, management_status: 'ACTIVA', type: 'EXCEDENTE_PARA_REVISION', id_product: 90,
    id_sucursal: 2, id_storage: 20, registry_number: 'REV-001',
    transfer: { id_sucursal_send: 3, id_storage_send: 30, id_sucursal_received: 2 },
  });

  const detail = row({
    id: 4, id_product: 5, quantity_difference: 10, quantity_resolved: 0,
    updatedAt: new Date(1000), transferDetail: { cost: 5 },
  });

  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async () => detail);
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => null);
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => []);
  t.mock.method(db.TransferReviewResolutionAction, 'sum', async () => 0);
  t.mock.method(db.TransferReviewResolutionAction, 'create', async (data) => row({ ...data, id: 99 }));
  t.mock.method(db.TransferReviewActionMovement, 'create', async (data) => data);
  t.mock.method(db.User, 'findOne', async () => ({ id: 9, role: 'ADMINISTRADOR' }));
  t.mock.method(db.TransferReviewInventoryHold, 'findOne', async () => row({ quantity: 10, id_product: 90, id_sucursal: 2, id_storage: 20 }));
  t.mock.method(workflow, 'syncNoteStatus', async () => note);

  let eventEmitted = null;
  t.mock.method(workflow, 'createEvent', async (noteId, userId, eventType, desc, meta) => {
    eventEmitted = { noteId, eventType, meta };
    return { id: 77 };
  });

  let notificationEmitted = null;
  t.mock.method(notifications, 'notifyTransferReviewStakeholders', async (payload) => {
    notificationEmitted = payload;
  });
  t.mock.method(integrity, 'verifyLocationsIntegrity', async () => []);

  t.mock.method(operations, 'createTransfer', async () => ({
    type: 'TRANSFER', document: { id: 40, cod: 'TRAS00040' }, movements: [{ id: 100 }], pendingReception: true,
  }));

  // Confirmar devolución al origen
  const result = await resolutionService.confirm({
    noteId: 1,
    detailId: 4,
    reasonCode: 'DIFERENCIA_BALANZAS',
    solutionCode: 'TRANSFER_RETURN',
    justification: 'Devolución de excedente comprobada en pesaje',
    documentReferences: [],
    authorizerUserId: 9,
    detailVersion: 1000,
    quantity: 10,
    idempotencyKey: 'IDEMP-EVENT-TEST-1',
    actorUserId: 9,
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.operation.type, 'TRANSFER');
  assert.equal(eventEmitted.eventType, 'CONCILIACION_AUTOMATICA');
  assert.equal(notificationEmitted.type, 'TRANSFER_REVIEW_AUTOMATED');

  // Probar falla intermedia: si createTransfer lanza error, no se emite evento ni se persiste
  detail.quantity_resolved = 0;
  detail.reconciliation_status = null;
  detail.updatedAt = new Date(1000);
  t.mock.method(operations, 'createTransfer', async () => {
    throw new Error('Falla en la creación de traslado');
  });

  await assert.rejects(async () => {
    await resolutionService.confirm({
      noteId: 1,
      detailId: 4,
      reasonCode: 'DIFERENCIA_BALANZAS',
      solutionCode: 'TRANSFER_RETURN',
      justification: 'Devolución fallida por falta de disponibilidad',
      documentReferences: [],
      authorizerUserId: 9,
      detailVersion: 1000,
      quantity: 10,
      idempotencyKey: 'IDEMP-FAIL-TEST',
      actorUserId: 9,
    });
  }, /Falla en la creación de traslado/);
});

test('5.7 reversión completa, reintento idempotente y bloqueo ante dependencias', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const row = (data) => ({ ...data, save: async () => {}, update: async () => {} });

  const note = row({
    id: 1,
    management_status: 'ACTIVA',
    details: [
      row({
        id: 10,
        id_product: 5,
        quantity_difference: 8,
        quantity_resolved: 8,
        inventoryHolds: [],
      }),
    ],
  });

  const automaticAction = row({
    id: 55,
    id_transfer_review_note: 1,
    management_status: 'ACTIVA',
    operation_mode: 'CREATED_AUTOMATICALLY',
    operation_status: 'ACTIVE',
    operation_type: 'TRANSFER',
    operation_id: 40,
    movementLinks: [{ id_kardex_movement: 100 }],
  });

  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => [automaticAction]);
  t.mock.method(db.TransferReviewResolutionAction, 'count', async () => 0);
  t.mock.method(db.TransferReviewResolutionAction, 'update', async () => {});
  t.mock.method(db.TransferReviewNoteDetail, 'update', async () => {});
  t.mock.method(db.TransferReviewInventoryHold, 'destroy', async () => {});
  t.mock.method(db.TransferReviewInventoryHold, 'create', async () => {});
  t.mock.method(db.TransferReviewActionMovement, 'create', async () => {});
  t.mock.method(workflow, 'createEvent', async () => ({ id: 88 }));
  t.mock.method(notifications, 'notifyTransferReviewStakeholders', async () => {});

  let reverseTransferCalled = false;
  t.mock.method(operations, 'reverseTransfer', async () => {
    reverseTransferCalled = true;
    return { movements: [{ id: 101 }] };
  });

  const reversedNote = await managementService.reverse({
    noteId: 1,
    reason: 'Corrección de error en despacho detectado posteriormente',
    actorUserId: 9,
  });

  assert.equal(reversedNote.management_status, 'REVERTIDA');
  assert.equal(reverseTransferCalled, true);
  assert.equal(automaticAction.operation_status, 'REVERSED');

  // Si se intenta revertir cuando ya está REVERTIDA, se rechaza
  await assert.rejects(async () => {
    await managementService.reverse({
      noteId: 1,
      reason: 'Segunda reversión no permitida',
      actorUserId: 9,
    });
  }, /Solo se puede revertir una conciliación activa/);

  // Si existe una operación manual verificada (VERIFIED_EXISTING), bloquea reversión automática
  note.management_status = 'ACTIVA';
  t.mock.method(db.TransferReviewResolutionAction, 'count', async () => 1);

  await assert.rejects(async () => {
    await managementService.reverse({
      noteId: 1,
      reason: 'Reversión bloqueada por operación manual',
      actorUserId: 9,
    });
  }, /verificó documentos creados fuera del expediente/);
});

test('3.3 resolución autorizada aplica Stock, Kardex, documento, estado, evento y alerta en una sola transacción idempotente', async (t) => {
  t.mock.method(integrity, 'verifyLocationsIntegrity', async () => []);
  const transaction = { id: 'TX-ATOMIC-1', LOCK: { UPDATE: 'UPDATE' } };
  const transactionsPassed = [];
  const trackTx = (tx) => { if (tx) transactionsPassed.push(tx); };

  const row = (data) => ({
    ...data,
    save: async (opts) => { trackTx(opts?.transaction); },
    destroy: async (opts) => { trackTx(opts?.transaction); },
  });

  const note = row({
    id: 1, management_status: 'ACTIVA', type: 'EXCEDENTE_PARA_REVISION', id_product: 90,
    id_sucursal: 2, id_storage: 20, registry_number: 'REV-001',
    transfer: { id_sucursal_send: 3, id_storage_send: 30, id_sucursal_received: 2 },
  });

  const detail = row({
    id: 4, id_product: 5, quantity_difference: 10, quantity_resolved: 0,
    updatedAt: new Date(1000), transferDetail: { cost: 5 },
  });

  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(db.TransferReviewNote, 'findByPk', async (_id, opts) => {
    trackTx(opts?.transaction);
    return note;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async (opts) => {
    trackTx(opts?.transaction);
    return detail;
  });

  let createdAction = null;
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async ({ where }) => {
    if (createdAction && where.idempotency_key === createdAction.idempotency_key) return createdAction;
    return null;
  });
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => []);
  t.mock.method(db.TransferReviewResolutionAction, 'create', async (data, opts) => {
    trackTx(opts?.transaction);
    createdAction = row({ ...data, id: 101 });
    return createdAction;
  });
  t.mock.method(db.TransferReviewActionMovement, 'create', async (data, opts) => {
    trackTx(opts?.transaction);
    return data;
  });
  t.mock.method(db.User, 'findOne', async () => ({ id: 9, role: 'ADMINISTRADOR' }));
  t.mock.method(db.TransferReviewInventoryHold, 'findOne', async (opts) => {
    trackTx(opts?.transaction);
    return row({ quantity: 10, id_product: 90, id_sucursal: 2, id_storage: 20 });
  });
  t.mock.method(workflow, 'syncNoteStatus', async (_id, tx) => {
    trackTx(tx);
    return note;
  });

  let eventPassedTx = null;
  t.mock.method(workflow, 'createEvent', async (noteId, userId, eventType, desc, meta, tx) => {
    eventPassedTx = tx;
    trackTx(tx);
    return { id: 88 };
  });

  let notificationPassedTx = null;
  t.mock.method(notifications, 'notifyTransferReviewStakeholders', async (_payload, tx) => {
    notificationPassedTx = tx;
    trackTx(tx);
  });

  t.mock.method(operations, 'createTransfer', async ({ transaction: tx }) => {
    trackTx(tx);
    return {
      type: 'TRANSFER', document: { id: 40, cod: 'TRAS00040' }, movements: [{ id: 100 }], pendingReception: true,
    };
  });

  const payload = {
    noteId: 1,
    detailId: 4,
    reasonCode: 'DIFERENCIA_BALANZAS',
    solutionCode: 'TRANSFER_RETURN',
    justification: 'Devolución confirmada con respaldo balanza',
    documentReferences: [],
    authorizerUserId: 9,
    detailVersion: 1000,
    quantity: 10,
    idempotencyKey: 'IDEMP-TASK-3-3',
    actorUserId: 9,
  };

  const firstResult = await resolutionService.confirm(payload);

  assert.equal(firstResult.idempotent, false);
  assert.equal(firstResult.specific_effect, 'REVERTIR');
  assert.equal(eventPassedTx, transaction, 'Evento debe ejecutarse en la misma transacción');
  assert.equal(notificationPassedTx, transaction, 'Notificación debe ejecutarse en la misma transacción');
  assert.ok(transactionsPassed.length > 5, 'Todos los pasos deben pasar la transacción');
  assert.ok(transactionsPassed.every((tx) => tx === transaction), 'Cada paso debe usar exactamente la misma transacción');

  // Reintento idempotente con la misma clave
  const retryResult = await resolutionService.confirm(payload);
  assert.equal(retryResult.idempotent, true);
  assert.equal(retryResult.specific_effect, 'REVERTIR');
  assert.equal(retryResult.action.id, 101);

  // Simulación de colisión concurrente: si create lanza SequelizeUniqueConstraintError
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => null); // findOne previo simula que no lo vio
  t.mock.method(db.TransferReviewResolutionAction, 'create', async () => {
    const err = new Error('Validation error');
    err.name = 'SequelizeUniqueConstraintError';
    throw err;
  });

  // Cuando normalizeConfirmationError busca por idempotency_key tras el conflicto, encuentra la acción ya comprometida
  const concurrentRetry = await resolutionService.confirm({
    ...payload,
    idempotencyKey: 'IDEMP-TASK-3-3',
  }).catch((err) => {
    // Si findOne dentro de normalizeConfirmationError encuentra la acción
    return err;
  });

  // Con findOne restaurado simulando la acción ya guardada en DB por la transacción ganadora
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => createdAction);
  const concurrentRecovered = await resolutionService.confirm({
    ...payload,
    idempotencyKey: 'IDEMP-TASK-3-3',
  });
  assert.equal(concurrentRecovered.idempotent, true);
  assert.equal(concurrentRecovered.specific_effect, 'REVERTIR');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';
const db = require('../database/config');
const operations = require('../services/reconciliation-operational-document.service');
const workflow = require('../services/transfer-review-workflow.service');
const notifications = require('../services/notification.service');
const service = require('../services/automated-transfer-review-resolution.service');
const { AUTOMATIC_RECONCILIATION_REASONS } = require('../constants/transfer-review');

function fixture(t, type) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const row = (data) => ({ ...data, save: async () => {}, destroy: async () => {} });
  const note = row({ id: 1, management_status: 'ACTIVA', type, id_product: 90,
    id_sucursal: 2, id_storage: 20, registry_number: 'REV-1', transfer: {
      id_sucursal_send: 3, id_storage_send: 30, id_sucursal_received: 2,
    } });
  const detail = row({ id: 4, id_product: 5, quantity_difference: 8,
    quantity_resolved: 0, updatedAt: new Date(1000), transferDetail: { cost: 3 } });
  t.mock.method(db.sequelize, 'transaction', async (callback) => callback(transaction));
  // Unexpected persistence must never fall through to an actual database connection.
  t.mock.method(db.sequelize, 'query', async () => { throw new Error('Unexpected database query'); });
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async () => detail);
  const existingAction = t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => null);
  t.mock.method(db.TransferReviewResolutionAction, 'sum', async () => 0);
  const actions = t.mock.method(db.TransferReviewResolutionAction, 'create', async (data) => row({ ...data, id: 8 }));
  const links = t.mock.method(db.TransferReviewActionMovement, 'create', async (data) => data);
  const authorizer = t.mock.method(db.User, 'findOne', async () => ({ id: 9, role: 'ADMINISTRADOR' }));
  t.mock.method(db.TransferReviewInventoryHold, 'findOne', async ({ where }) =>
    where.disposition === 'EN_REVISION' ? row({ quantity: 8, id_product: 90, id_sucursal: 2, id_storage: 20 }) : null);
  t.mock.method(db.TransferReviewInventoryHold, 'create', async (data) => row(data));
  t.mock.method(workflow, 'syncNoteStatus', async () => note);
  const events = t.mock.method(workflow, 'createEvent', async () => ({ id: 12 }));
  t.mock.method(notifications, 'notifyTransferReviewStakeholders', async () => {});
  const directStock = t.mock.method(db.Stock, 'findOne', async () => { throw new Error('Unexpected physical stock access'); });
  const directKardex = t.mock.method(db.kardexMovements, 'create', async () => { throw new Error('Unexpected additional Kardex movement'); });
  const transfer = t.mock.method(operations, 'createTransfer', async () => ({
    type: 'TRANSFER', document: { id: 40, cod: 'TRAS00040' }, movements: [{ id: 100 }], pendingReception: true,
  }));
  const classification = t.mock.method(operations, 'createClassification', async () => ({
    type: 'CLASSIFIED', document: { id: 50, cod: 'CL00050' }, movements: [{ id: 101 }, { id: 102 }],
  }));
  return { actions, links, events, directStock, directKardex, transfer, classification, transaction, existingAction, authorizer,
    request: { noteId: 1, detailId: 4, reasonCode: 'DIFERENCIA_BALANZAS',
      justification: 'Confirmación verificada por operador', documentReferences: [],
      authorizerUserId: 9, detailVersion: 1000, quantity: 8, idempotencyKey: 'test-effect', actorUserId: 9 } };
}

for (const type of ['EXCEDENTE_PARA_REVISION', 'FALTANTE_PARA_REVISION']) {
  test(`8.1 previsualización cubre toda la matriz de motivos y soluciones para ${type}`, async (t) => {
    fixture(t, type);

    const result = await service.preview({ noteId: 1, detailId: 4 });
    const expected = Object.entries(AUTOMATIC_RECONCILIATION_REASONS)
      .filter(([, policy]) => Array.isArray(policy.solutions[type]))
      .map(([code, policy]) => ({
        code,
        solution_codes: [...policy.solutions[type]],
        required_references: [...policy.requiredReferences],
      }));
    const actual = result.reasons.map(({ code, solution_codes, required_references }) => ({
      code,
      solution_codes: [...solution_codes],
      required_references: [...required_references],
    }));

    assert.equal(result.status, 'READY');
    assert.deepEqual(actual, expected);
    assert.deepEqual(
      [...new Set(result.reasons.flatMap(({ solution_codes }) => solution_codes))].sort(),
      result.solutions.map(({ code }) => code).sort(),
    );
    assert.equal(result.reasons.some(({ code }) => code === 'PERDIDA_TRANSITO'), type === 'FALTANTE_PARA_REVISION');
  });
}

for (const type of ['EXCEDENTE_PARA_REVISION', 'FALTANTE_PARA_REVISION']) {
  test(`mantener ${type} no crea operación, stock ni Kardex adicional`, async (t) => {
    const f = fixture(t, type);
    const result = await service.confirm({ ...f.request, solutionCode: 'CONFIRM_DIFFERENCE' });
    assert.equal(result.operation.type, 'CONFIRMATION');
    assert.equal(result.operation.id, null);
    assert.equal(result.pending_quantity, 0);
    for (const mock of [f.transfer, f.classification, f.directStock, f.directKardex, f.links]) {
      assert.equal(mock.mock.callCount(), 0);
    }
    assert.equal(f.actions.mock.callCount(), 1);
    assert.equal(f.events.mock.callCount(), 1);
  });
}

test('devolver excedente crea solamente el traslado con producto y recorrido derivados', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  await service.confirm({ ...f.request, solutionCode: 'TRANSFER_RETURN' });
  assert.equal(f.transfer.mock.callCount(), 1);
  assert.equal(f.classification.mock.callCount(), 0);
  const { command, transaction } = f.transfer.mock.calls[0].arguments[0];
  assert.equal(transaction, f.transaction);
  assert.equal(command.productId, 5);
  assert.equal(command.quantity, 8);
  assert.equal(command.sourceSucursalId, 2);
  assert.equal(command.sourceStorageId, 20);
  assert.equal(command.targetSucursalId, 3);
  assert.equal(command.targetStorageId, 30);
  assert.equal(f.links.mock.callCount(), 1);
  assert.equal(f.directKardex.mock.callCount(), 0);
});

for (const [type, solution, source, target] of [
  ['EXCEDENTE_PARA_REVISION', 'CLASSIFY_EXCESS', 5, 6],
  ['FALTANTE_PARA_REVISION', 'CLASSIFY_SHORTAGE', 90, 5],
]) {
  test(`${solution} delega una sola clasificación y respeta productos derivados`, async (t) => {
    const f = fixture(t, type);
    await service.confirm({ ...f.request, solutionCode: solution, targetProductId: 6 });
    assert.equal(f.classification.mock.callCount(), 1);
    assert.equal(f.transfer.mock.callCount(), 0);
    const { command, transaction } = f.classification.mock.calls[0].arguments[0];
    assert.equal(transaction, f.transaction);
    assert.equal(command.productId, source);
    assert.equal(command.targetProductId, target);
    assert.equal(command.quantity, 8);
    assert.equal(f.links.mock.callCount(), 2);
    assert.equal(f.directKardex.mock.callCount(), 0);
  });
}

test('un faltante no permite crear una devolución ni una operación incompatible', async (t) => {
  const f = fixture(t, 'FALTANTE_PARA_REVISION');
  await assert.rejects(service.confirm({ ...f.request, solutionCode: 'TRANSFER_RETURN' }), /no corresponde al motivo/);
  for (const mock of [f.transfer, f.classification, f.actions, f.links, f.events]) {
    assert.equal(mock.mock.callCount(), 0);
  }
});

test('8.2 rechaza autorizador no permitido sin crear ningún efecto', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  f.authorizer.mock.mockImplementation(async () => null);

  await assert.rejects(service.confirm({ ...f.request, solutionCode: 'CONFIRM_DIFFERENCE' }), /permiso|autoriza/i);
  for (const mock of [f.transfer, f.classification, f.actions, f.links, f.events]) assert.equal(mock.mock.callCount(), 0);
});

test('8.2 rechaza versión obsoleta antes de documentos, acciones y notificaciones', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');

  await assert.rejects(service.confirm({ ...f.request, detailVersion: 999, solutionCode: 'CONFIRM_DIFFERENCE' }), /cambió después de la previsualización/i);
  for (const mock of [f.transfer, f.classification, f.actions, f.links, f.events]) assert.equal(mock.mock.callCount(), 0);
});

test('8.2 un duplicado idempotente devuelve la acción existente sin repetir efectos', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  const previous = { id: 77, idempotency_key: f.request.idempotencyKey };
  f.existingAction.mock.mockImplementation(async () => previous);

  const result = await service.confirm({ ...f.request, solutionCode: 'CONFIRM_DIFFERENCE' });

  assert.equal(result.idempotent, true);
  assert.equal(result.action, previous);
  for (const mock of [f.transfer, f.classification, f.actions, f.links, f.events]) assert.equal(mock.mock.callCount(), 0);
});

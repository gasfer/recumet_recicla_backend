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
  // La previsualización consulta el saldo de Kardex, pero no debe persistir nada.
  t.mock.method(db.sequelize, 'query', async () => []);
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async () => detail);
  const existingAction = t.mock.method(db.TransferReviewResolutionAction, 'findOne', async () => null);
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => []);
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
  const parity = t.mock.method(integrity, 'verifyLocationsIntegrity', async ({ locations }) => locations.map((location) => ({
    ...location, consistent: true, difference: 0,
  })));
  const directStock = t.mock.method(db.Stock, 'findOne', async () => row({ stock: 0 }));
  const directKardex = t.mock.method(db.kardexMovements, 'create', async () => { throw new Error('Unexpected additional Kardex movement'); });
  const transfer = t.mock.method(operations, 'createTransfer', async () => ({
    type: 'TRANSFER', document: { id: 40, cod: 'TRAS00040' }, movements: [{ id: 100 }], pendingReception: true,
  }));
  const classification = t.mock.method(operations, 'createClassification', async () => ({
    type: 'CLASSIFIED', document: { id: 50, cod: 'CL00050' }, movements: [{ id: 101 }, { id: 102 }],
  }));
  return { actions, links, events, directStock, directKardex, transfer, classification, parity, transaction, existingAction, authorizer,
    request: { noteId: 1, detailId: 4, reasonCode: 'DIFERENCIA_BALANZAS',
      justification: 'Confirmación verificada por operador', documentReferences: [],
      authorizerUserId: 9, detailVersion: 1000, quantity: 8, idempotencyKey: 'test-effect', actorUserId: 9 } };
}

test('la conciliación revierte antes de cerrar cuando falla la paridad Stock–Kardex', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  f.parity.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error('Stock y Kardex no terminan con el mismo saldo.'), {
      code: 'STOCK_KARDEX_PARITY_VIOLATION', statusCode: 409,
    });
  });

  await assert.rejects(
    service.confirm({ ...f.request, solutionCode: 'CONFIRM_DIFFERENCE' }),
    (error) => error.code === 'STOCK_KARDEX_PARITY_VIOLATION' && error.statusCode === 409,
  );
  assert.equal(f.events.mock.callCount(), 0);
});

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
  const result = await service.confirm({ ...f.request, solutionCode: 'TRANSFER_RETURN' });
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
  assert.equal(result.pending_reception, true);
  assert.equal(result.pending_quantity, 8);
  assert.equal(f.actions.mock.calls[0].arguments[0].operation_status, 'PENDING_RECEPTION');
});

for (const [type, solution, source, target] of [
  ['EXCEDENTE_PARA_REVISION', 'CLASSIFY_EXCESS', 5, 6],
  ['FALTANTE_PARA_REVISION', 'CLASSIFY_SHORTAGE', 90, 5],
  ['FALTANTE_PARA_REVISION', 'LOCATE_SHORTAGE', 90, 5],
]) {
  test(`${solution} delega una sola clasificación y respeta productos derivados`, async (t) => {
    const f = fixture(t, type);
    await service.confirm({
      ...f.request,
      reasonCode: solution === 'LOCATE_SHORTAGE' ? 'FALTANTE_LOCALIZADO' : f.request.reasonCode,
      solutionCode: solution,
      targetProductId: 6,
    });
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

test('3.2 previsualización expone normal_receipt, blocked_document y soluciones con specific_effect', async (t) => {
  for (const type of ['EXCEDENTE_PARA_REVISION', 'FALTANTE_PARA_REVISION']) {
    const f = fixture(t, type);
    f.request; // ensure fixture setup
    const previewResult = await service.preview({ noteId: 1, detailId: 4 });

    assert.equal(previewResult.status, 'READY');
    assert.ok(previewResult.normal_receipt, 'Debe incluir normal_receipt');
    assert.equal(typeof previewResult.normal_receipt.normal_quantity, 'number');
    assert.ok(previewResult.blocked_document, 'Debe incluir blocked_document');
    assert.equal(previewResult.blocked_document.status, 'BLOQUEADO_EN_REVISION');
    assert.equal(
      previewResult.blocked_document.document_type,
      type === 'EXCEDENTE_PARA_REVISION' ? 'NOTA_INGRESO_EXCEDENTE' : 'INGRESO_TEMPORAL_DIFERENCIAS'
    );
    assert.equal(previewResult.blocked_document.quantity_blocked, 8);

    const allowedEffects = ['LIBERAR', 'RECLASIFICAR', 'REVERTIR', 'AJUSTAR'];
    for (const sol of previewResult.solutions) {
      assert.ok(allowedEffects.includes(sol.specific_effect), `Solución ${sol.code} debe tener efecto específico válido: ${sol.specific_effect}`);
    }

    const solMap = Object.fromEntries(previewResult.solutions.map((s) => [s.code, s.specific_effect]));
    assert.equal(solMap.CONFIRM_DIFFERENCE, 'AJUSTAR');
    if (type === 'EXCEDENTE_PARA_REVISION') {
      assert.equal(solMap.REGISTER_RECEIPT_SURPLUS, 'LIBERAR');
      assert.equal(solMap.TRANSFER_RETURN, 'REVERTIR');
      assert.equal(solMap.CLASSIFY_EXCESS, 'RECLASIFICAR');
    } else {
      assert.equal(solMap.REGISTER_RECEIPT_SHORTAGE, 'LIBERAR');
      assert.equal(solMap.CLASSIFY_SHORTAGE, 'RECLASIFICAR');
      assert.equal(solMap.LOCATE_SHORTAGE, 'RECLASIFICAR');
    }
  }
});

test('3.2 confirmación expone normal_receipt, blocked_document y specific_effect aplicado', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  const result = await service.confirm({ ...f.request, solutionCode: 'TRANSFER_RETURN' });

  assert.ok(result.normal_receipt, 'Debe incluir normal_receipt');
  assert.ok(result.blocked_document, 'Debe incluir blocked_document');
  assert.equal(result.blocked_document.status, 'BLOQUEADO_EN_REVISION');
  assert.equal(result.specific_effect, 'REVERTIR');
  assert.equal(result.applied_effect, 'REVERTIR');
});

test('3.2 confirmación idempotente preserva specific_effect', async (t) => {
  const f = fixture(t, 'EXCEDENTE_PARA_REVISION');
  const previous = { id: 88, strategy: 'CLASSIFY_EXCESS', idempotency_key: f.request.idempotencyKey };
  f.existingAction.mock.mockImplementation(async () => previous);

  const result = await service.confirm({ ...f.request, solutionCode: 'CLASSIFY_EXCESS' });

  assert.equal(result.idempotent, true);
  assert.equal(result.specific_effect, 'RECLASIFICAR');
  assert.equal(result.applied_effect, 'RECLASIFICAR');
});

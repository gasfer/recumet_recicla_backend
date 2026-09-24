'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const notificationService = require('../services/notification.service');
const operationalVerificationService = require('../services/transfer-review-operational-verification.service');
const stockKardexIntegrity = require('../services/stock-kardex-integrity.service');
const { documentaryCloseDetail } = require('../services/transfer-review-documentary.service');

const createFixture = (t, {
  type = 'EXCEDENTE_PARA_REVISION',
  difference = 10,
  resolved = 0,
  assignedUserId = null,
  existingAction = null,
  serializeTransactions = false,
  failNotification = false,
} = {}) => {
  const events = [];
  const actions = [];
  const evidences = [];
  const modelWrites = { stock: 0, kardex: 0 };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const note = {
    id: 41,
    registry_number: 'NTR-000041',
    type,
    id_assigned_user: assignedUserId,
    assigned_at: null,
    reconciliation_status: 'EN_REVISION',
    resolved_at: null,
    id_resolved_user: null,
    id_kardex_movement: 700,
    save: async () => note,
  };
  const detail = {
    id: 51,
    quantity_difference: difference,
    quantity_resolved: resolved,
    reconciliation_status: 'EN_REVISION',
    resolved_at: null,
    id_resolved_user: null,
    reviewNote: note,
    save: async () => detail,
  };
  note.details = [detail];
  const holds = [{
    id: 61,
    quantity: difference,
    disposition: 'EN_REVISION',
    id_product: 3,
    id_sucursal: 2,
    id_storage: 4,
    save: async function save() { return this; },
    destroy: async function destroy() { holds.splice(holds.indexOf(this), 1); },
  }];

  let transactionQueue = Promise.resolve();
  const runTransaction = async (callback) => {
    const snapshot = {
      note: { ...note },
      detail: { ...detail },
      holds: holds.map((hold) => ({ ...hold })),
      eventsLength: events.length,
      actionsLength: actions.length,
      evidencesLength: evidences.length,
    };
    try {
      return await callback(transaction);
    } catch (error) {
      Object.assign(note, snapshot.note);
      Object.assign(detail, snapshot.detail);
      holds.splice(0, holds.length, ...snapshot.holds);
      events.splice(snapshot.eventsLength);
      actions.splice(snapshot.actionsLength);
      evidences.splice(snapshot.evidencesLength);
      throw error;
    }
  };
  t.mock.method(db.sequelize, 'transaction', async (callback) => {
    if (!serializeTransactions) return runTransaction(callback);
    const queued = transactionQueue.then(() => runTransaction(callback));
    transactionQueue = queued.catch(() => undefined);
    return queued;
  });
  t.mock.method(db.TransferReviewResolutionAction, 'findOne', async ({ where }) => (
    existingAction || actions.find(({ idempotency_key }) => idempotency_key === where.idempotency_key) || null
  ));
  t.mock.method(db.TransferReviewResolutionAction, 'create', async (values) => {
    const action = { id: 71 + actions.length, ...values };
    actions.push(action);
    return action;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'findOne', async (options) => {
    assert.equal(options.lock, transaction.LOCK.UPDATE);
    assert.equal(options.include, undefined);
    return detail;
  });
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async (options) => {
    assert.equal(options.lock, transaction.LOCK.UPDATE);
    assert.equal(options.where.id_transfer_review_note, note.id);
    return note.details;
  });
  t.mock.method(db.TransferReviewInventoryHold, 'findAll', async (options) => {
    assert.equal(options.lock, transaction.LOCK.UPDATE);
    return options.where.disposition
      ? holds.filter(({ disposition }) => disposition !== 'LIBERADO_POR_AJUSTE')
      : holds;
  });
  t.mock.method(db.TransferReviewInventoryHold, 'create', async (values) => {
    const hold = {
      id: 80 + holds.length,
      ...values,
      save: async function save() { return this; },
      destroy: async function destroy() { holds.splice(holds.indexOf(this), 1); },
    };
    holds.push(hold);
    return hold;
  });
  t.mock.method(db.TransferReviewEvidence, 'count', async () => evidences.length);
  t.mock.method(db.TransferReviewEvidence, 'create', async (values) => {
    const evidence = { id: 91 + evidences.length, ...values };
    evidences.push(evidence);
    return evidence;
  });
  t.mock.method(db.TransferReviewEvent, 'create', async (values) => {
    const event = { id: 101 + events.length, ...values };
    events.push(event);
    return event;
  });
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => note);
  t.mock.method(db.User, 'findOne', async ({ where }) => ({ id: where.id, full_names: 'Supervisor de prueba', role: 'ENCARGADO', status: true }));
  t.mock.method(notificationService, 'notifyTransferReviewStakeholders', async () => {
    if (failNotification) throw new Error('Fallo simulado antes de confirmar la transacción');
    return undefined;
  });
  t.mock.method(operationalVerificationService, 'verifyOperationalResolution', async ({ quantity }) => ({
    documentType: 'NOTA_CLASIFICACION_MERMA',
    documentId: 501,
    documentNumber: 'CL-000501',
    documentQuantity: quantity,
    affectedLocations: [{ productId: 3, sucursalId: 2, storageId: 4 }],
  }));
  t.mock.method(stockKardexIntegrity, 'verifyLocationsIntegrity', async () => [{
    productId: 3, sucursalId: 2, storageId: 4, consistent: true, difference: 0,
  }]);
  t.mock.method(db.Stock, 'update', async () => { modelWrites.stock += 1; });
  t.mock.method(db.kardexMovements, 'create', async () => { modelWrites.kardex += 1; });

  return { note, detail, holds, events, actions, evidences, modelWrites };
};

const activeHoldTotal = (holds) => holds
  .filter(({ disposition }) => disposition !== 'LIBERADO_POR_AJUSTE')
  .reduce((total, hold) => total + Number(hold.quantity), 0);

const documentReferences = (...types) => types.map((documentType, index) => ({
  document_type: documentType,
  document_number: `DOC-${index + 1}`,
}));

const standardCases = [
  {
    reasonCode: 'DIFERENCIA_BALANZAS',
    references: ['NOTA_CLASIFICACION_MERMA'],
  },
  {
    reasonCode: 'MATERIAL_INCORRECTO',
    references: ['NOTA_CLASIFICACION'],
  },
  {
    reasonCode: 'DISCREPANCIA_FISICO_SISTEMA',
    references: ['ACTA_REGULARIZACION'],
  },
  {
    reasonCode: 'ERROR_PESO_REGISTRADO',
    references: ['TICKET_BALANZA'],
  },
  {
    reasonCode: 'PERDIDA_TRANSITO',
    type: 'FALTANTE_PARA_REVISION',
    references: ['ACTA_INCIDENCIA'],
  },
  {
    reasonCode: 'ERROR_DIGITACION',
    references: ['NOTA_CORREGIDA'],
  },
];

for (const scenario of standardCases) {
  test(`concilia el caso operativo ${scenario.reasonCode} sin adjuntos ni inventario`, async (t) => {
    const fixture = createFixture(t, { type: scenario.type || 'EXCEDENTE_PARA_REVISION' });
    await documentaryCloseDetail({
      noteId: fixture.note.id,
      detailId: fixture.detail.id,
      reasonCode: scenario.reasonCode,
      noteOrReference: 'Referencias documentales verificadas',
      documentReferences: documentReferences(...scenario.references),
      operationalJustification: 'La diferencia fue comprobada durante la revisión operativa.',
      authorizerUserId: 22,
      idempotencyKey: `case-${scenario.reasonCode}`,
      actorUserId: 9,
    });

    assert.equal(fixture.actions.length, 1);
    assert.equal(fixture.evidences.length, 0);
    assert.equal(fixture.events.some(({ event_type }) => event_type === 'SIN_AJUSTE_INVENTARIO'), true);
    assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
  });
}

for (const scenario of [
  { type: 'EXCEDENTE_PARA_REVISION', reasonCode: 'MAYOR_CANTIDAD_RECIBIDA' },
  { type: 'FALTANTE_PARA_REVISION', reasonCode: 'FALTANTE_CONFIRMADO' },
]) {
  test(`cierra ${scenario.type} completo sin escribir stock ni Kardex`, async (t) => {
    const fixture = createFixture(t, { type: scenario.type });
    const result = await documentaryCloseDetail({
      noteId: fixture.note.id,
      detailId: fixture.detail.id,
      reasonCode: scenario.reasonCode,
      noteOrReference: 'Pesaje y acta verificados',
      idempotencyKey: `complete-${scenario.type}`,
      actorUserId: 9,
    });

    assert.equal(result.inventory_effect, 'VERIFIED_EXISTING_OPERATION');
    assert.equal(result.closed_automatically, true);
    assert.equal(fixture.detail.reconciliation_status, 'COMPLETADO');
    assert.equal(fixture.note.resolved_at instanceof Date, true);
    assert.equal(activeHoldTotal(fixture.holds), 0);
    assert.equal(fixture.holds.some(({ disposition, quantity }) => disposition === 'LIBERADO_POR_AJUSTE' && Number(quantity) === 10), true);
    assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
    assert.equal(fixture.events.some((event) => event.event_type === 'SIN_AJUSTE_INVENTARIO'
      && event.metadata.inventory_effect === 'VERIFIED_EXISTING_OPERATION'
      && event.metadata.operational_verification === true), true);
    assert.equal(fixture.events.some(({ event_type }) => event_type === 'CERRADA_DOCUMENTALMENTE'), true);
  });
}

test('libera la parte regularizada y conserva retenido sólo el remanente', async (t) => {
  const fixture = createFixture(t, { difference: 30.5 });
  const result = await documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'TOLERANCIA_ACEPTADA',
    noteOrReference: 'Autorizacion interna 4581',
    quantity: 12,
    idempotencyKey: 'partial-1',
    actorUserId: 9,
  });

  assert.equal(result.pending_quantity, 18.5);
  assert.equal(result.closed_automatically, false);
  assert.equal(fixture.detail.quantity_resolved, 12);
  assert.equal(fixture.detail.reconciliation_status, 'EN_REVISION');
  assert.equal(activeHoldTotal(fixture.holds), 18.5);
  assert.equal(Number(fixture.holds.find(({ disposition }) => disposition === 'EN_REVISION').quantity), 18.5);
  assert.equal(Number(fixture.holds.find(({ disposition }) => disposition === 'LIBERADO_POR_AJUSTE').quantity), 12);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('asigna al actor y cierra automaticamente el ultimo pendiente', async (t) => {
  const fixture = createFixture(t);
  await documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'MAYOR_CANTIDAD_RECIBIDA',
    noteOrReference: 'Recepcion confirmada por supervisor',
    idempotencyKey: 'auto-close-1',
    actorUserId: 27,
  });

  assert.equal(fixture.note.id_assigned_user, 27);
  assert.equal(fixture.note.id_resolved_user, 27);
  assert.equal(fixture.events.some(({ event_type }) => event_type === 'ASIGNADA_AUTOMATICAMENTE'), true);
  assert.equal(fixture.events.at(-1).event_type, 'CERRADA_DOCUMENTALMENTE');
});

test('rechaza motivos incompatibles, referencias insuficientes y evidencia faltante', async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'FALTANTE_CONFIRMADO',
    noteOrReference: 'Acta valida',
    idempotencyKey: 'invalid-reason',
    actorUserId: 9,
  }), /motivo documental no corresponde/i);
  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'OTRO',
    noteOrReference: 'Breve',
    idempotencyKey: 'short-other',
    actorUserId: 9,
  }), /mayor precisi.n/i);
  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'PROCEDENCIA_DOCUMENTADA',
    noteOrReference: 'Documento de procedencia 897',
    idempotencyKey: 'missing-evidence',
    actorUserId: 9,
  }), /requiere evidencia/i);
  assert.equal(fixture.actions.length, 0);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('registra la evidencia requerida en la misma conciliacion', async (t) => {
  const fixture = createFixture(t);
  await documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'PROCEDENCIA_DOCUMENTADA',
    noteOrReference: 'Guia externa EXT-2026-44',
    evidence: { evidence_type: 'DOCUMENTO', description: 'Guia de procedencia firmada' },
    idempotencyKey: 'evidence-1',
    actorUserId: 9,
  });

  assert.equal(fixture.evidences.length, 1);
  const event = fixture.events.find(({ event_type }) => event_type === 'SIN_AJUSTE_INVENTARIO');
  assert.deepEqual(event.metadata.evidence_ids, [fixture.evidences[0].id]);
});

test('registra caso operativo con referencias, ejecutor y autorizador sin adjuntos', async (t) => {
  const fixture = createFixture(t);
  await documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'DIFERENCIA_BALANZAS',
    noteOrReference: 'Referencias estructuradas de pesaje',
    documentReferences: documentReferences('NOTA_TRASLADO_ORIGEN'),
    operationalJustification: 'Las balanzas registraron una diferencia comprobada.',
    authorizerUserId: 22,
    idempotencyKey: 'standard-case-1',
    actorUserId: 9,
  });

  assert.equal(fixture.evidences.length, 0);
  assert.equal(fixture.actions[0].id_user, 9);
  assert.equal(fixture.actions[0].id_approved_user, 22);
  assert.equal(fixture.actions[0].approved_at instanceof Date, true);
  const event = fixture.events.find(({ event_type }) => event_type === 'SIN_AJUSTE_INVENTARIO');
  assert.equal(event.metadata.document_references.length, 1);
  assert.equal(event.metadata.document_references[0].document_type, 'NOTA_TRASLADO_ORIGEN');
  assert.match(event.metadata.document_references[0].document_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(event.metadata.operational_justification, 'Las balanzas registraron una diferencia comprobada.');
  assert.equal(event.metadata.executor_user_id, 9);
  assert.equal(event.metadata.authorizer_user_id, 22);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('rechaza referencias incompletas y perdida en transito para un excedente', async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'DIFERENCIA_BALANZAS',
    noteOrReference: 'Referencias incompletas',
    documentReferences: [{ document_type: 'NOTA_CLASIFICACION_MERMA', document_number: '' }],
    operationalJustification: 'Existe diferencia entre ambos pesajes.',
    authorizerUserId: 22,
    idempotencyKey: 'missing-standard-reference',
    actorUserId: 9,
  }), /complete el n.mero/i);
  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'PERDIDA_TRANSITO',
    noteOrReference: 'Acta de incidencia',
    idempotencyKey: 'invalid-loss-excess',
    actorUserId: 9,
  }), /motivo documental no corresponde/i);
  assert.equal(fixture.actions.length, 0);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('un reintento idempotente no vuelve a tocar detalle, retenciones ni eventos', async (t) => {
  const existingAction = { id: 500, idempotency_key: 'same-key' };
  const fixture = createFixture(t, { existingAction });
  const result = await documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'MAYOR_CANTIDAD_RECIBIDA',
    noteOrReference: 'Acta confirmada',
    idempotencyKey: 'same-key',
    actorUserId: 9,
  });

  assert.equal(result.idempotent, true);
  assert.equal(result.action, existingAction);
  assert.equal(fixture.detail.quantity_resolved, 0);
  assert.equal(fixture.actions.length, 0);
  assert.equal(fixture.events.length, 0);
  assert.equal(activeHoldTotal(fixture.holds), 10);
});

test('dos confirmaciones simultaneas se serializan sin duplicar acciones ni eventos', async (t) => {
  const fixture = createFixture(t, { serializeTransactions: true });
  const request = {
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'MAYOR_CANTIDAD_RECIBIDA',
    noteOrReference: 'Acta confirmada por ambos usuarios',
    idempotencyKey: 'concurrent-close-1',
    actorUserId: 9,
  };

  const [first, second] = await Promise.all([
    documentaryCloseDetail(request),
    documentaryCloseDetail({ ...request, actorUserId: 10 }),
  ]);

  assert.equal([first, second].filter(({ idempotent }) => !idempotent).length, 1);
  assert.equal([first, second].filter(({ idempotent }) => idempotent).length, 1);
  assert.equal(fixture.actions.length, 1);
  assert.equal(fixture.events.filter(({ event_type }) => event_type === 'SIN_AJUSTE_INVENTARIO').length, 1);
  assert.equal(fixture.events.filter(({ event_type }) => event_type === 'CERRADA_DOCUMENTALMENTE').length, 1);
  assert.equal(activeHoldTotal(fixture.holds), 0);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('un fallo tardio revierte asignacion, conciliacion, retenciones y eventos', async (t) => {
  const fixture = createFixture(t, { failNotification: true });

  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'MAYOR_CANTIDAD_RECIBIDA',
    noteOrReference: 'Acta cuyo cierre falla antes del commit',
    idempotencyKey: 'rollback-close-1',
    actorUserId: 9,
  }), /fallo simulado/i);

  assert.equal(fixture.note.id_assigned_user, null);
  assert.equal(fixture.note.resolved_at, null);
  assert.equal(fixture.detail.quantity_resolved, 0);
  assert.equal(fixture.detail.reconciliation_status, 'EN_REVISION');
  assert.equal(activeHoldTotal(fixture.holds), 10);
  assert.equal(fixture.actions.length, 0);
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.evidences.length, 0);
  assert.deepEqual(fixture.modelWrites, { stock: 0, kardex: 0 });
});

test('no libera la retención ni cierra cuando la operación existente deja Stock y Kardex descuadrados', async (t) => {
  const fixture = createFixture(t);
  t.mock.method(stockKardexIntegrity, 'verifyLocationsIntegrity', async () => {
    throw Object.assign(new Error('Stock y Kardex no coinciden.'), { code: 'STOCK_KARDEX_PARITY_VIOLATION', statusCode: 409 });
  });

  await assert.rejects(() => documentaryCloseDetail({
    noteId: fixture.note.id,
    detailId: fixture.detail.id,
    reasonCode: 'MAYOR_CANTIDAD_RECIBIDA',
    noteOrReference: 'Operación existente con saldo desigual',
    idempotencyKey: 'unbalanced-documentary-close',
    actorUserId: 9,
  }), (error) => error.code === 'STOCK_KARDEX_PARITY_VIOLATION');

  assert.equal(activeHoldTotal(fixture.holds), 10);
  assert.equal(fixture.actions.length, 0);
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.detail.reconciliation_status, 'EN_REVISION');
});

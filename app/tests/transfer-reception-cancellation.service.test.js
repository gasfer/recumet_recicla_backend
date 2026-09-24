'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const eligibilityService = require('../services/transfer-cancellation-eligibility.service');
const receptionCancellation = require('../services/transfer-reception-cancellation.service');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const integrityService = require('../services/stock-kardex-integrity.service');
const cancellationService = require('../services/transfer-cancellation.service');

const row = (values) => ({ ...values, async save() { this.saved = true; } });

test('anula la recepción, revierte conciliaciones y devuelve el traslado a PENDING', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const detail = row({ id: 4, quantity_received: 9, accounting_status: 'CONTABILIZADO' });
  const transfer = row({
    id: 12,
    cod: 'TRAS00012',
    status: 'RECEIVED',
    id_sucursal_received: 2,
    id_storage_received: 5,
    id_user_received: 8,
    date_received: new Date('2026-09-10'),
    observations_received: 'Recibido',
    detailsTransfers: [detail],
  });
  const calls = [];
  t.mock.method(eligibilityService, 'getCancellationEligibility', async () => ({ eligible: true, mode: 'CANCEL_RECEPTION', transfer }));
  t.mock.method(db.Transfers, 'findOne', async () => transfer);
  t.mock.method(receptionCancellation, 'reverseReconciliationActions', async () => {
    calls.push('reconciliations');
    return [{ productId: 7, sucursalId: 2, storageId: 5 }];
  });
  t.mock.method(receptionCancellation, 'preserveAndReverseReceipt', async () => {
    calls.push('receipt');
    return [{ productId: 8, sucursalId: 2, storageId: 5 }];
  });
  t.mock.method(receptionCancellation, 'closeReconciliationTrace', async () => { calls.push('trace'); });
  let verifiedLocations;
  t.mock.method(integrityService, 'verifyLocationsIntegrity', async ({ locations }) => { verifiedLocations = locations; });
  let history;
  t.mock.method(db.History, 'create', async (values) => { history = values; });

  const result = await cancellationService.cancelReceivedTransfer({
    transferId: 12,
    actorUserId: 3,
    reason: 'Recepción registrada por error',
    transaction,
  });

  assert.deepEqual(calls, ['reconciliations', 'receipt', 'trace']);
  assert.equal(transfer.status, 'PENDING');
  assert.equal(transfer.id_user_received, null);
  assert.equal(transfer.id_storage_received, null);
  assert.equal(transfer.date_received, null);
  assert.equal(transfer.saved, true);
  assert.equal(verifiedLocations.length, 2);
  assert.equal(history.id_sucursal, 2);
  assert.equal(result.notification.type, 'TRANSFER_RECEPTION_CANCELLATION');
});

test('rechaza un motivo sin trazabilidad suficiente antes de modificar inventario', async () => {
  await assert.rejects(
    cancellationService.cancelReceivedTransfer({ transferId: 12, actorUserId: 3, reason: 'corto', transaction: {} }),
    (error) => error.statusCode === 422,
  );
});

test('un pendiente bloquea antes de modificar recepción, Stock, Kardex o auditoría', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  let mutations = 0;
  t.mock.method(eligibilityService, 'getCancellationEligibility', async () => ({
    eligible: false,
    mode: 'RECEPTION_BLOCKED',
    reason: 'La recepción tiene una retención pendiente.',
    blockers: [{ type: 'ACTIVE_INVENTORY_HOLDS', count: 1 }],
  }));
  t.mock.method(db.Transfers, 'findOne', async () => { mutations += 1; });
  t.mock.method(db.History, 'create', async () => { mutations += 1; });
  t.mock.method(receptionCancellation, 'reverseReconciliationActions', async () => { mutations += 1; });
  t.mock.method(receptionCancellation, 'preserveAndReverseReceipt', async () => { mutations += 1; });

  await assert.rejects(
    cancellationService.cancelReceivedTransfer({
      transferId: 12,
      actorUserId: 3,
      reason: 'Recepción registrada por error',
      transaction,
    }),
    (error) => error.statusCode === 409 && error.code === 'TRANSFER_CANCELLATION_REJECTED',
  );
  assert.equal(mutations, 0);
});

test('un desfase Stock–Kardex aborta antes de crear auditoría', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const transfer = row({
    id: 12,
    cod: 'TRAS00012',
    status: 'RECEIVED',
    id_sucursal_received: 2,
    id_storage_received: 5,
    detailsTransfers: [],
  });
  let historyCreated = false;
  t.mock.method(eligibilityService, 'getCancellationEligibility', async () => ({ eligible: true, mode: 'CANCEL_RECEPTION' }));
  t.mock.method(db.Transfers, 'findOne', async () => transfer);
  t.mock.method(receptionCancellation, 'reverseReconciliationActions', async () => [{ productId: 7, sucursalId: 2, storageId: 5 }]);
  t.mock.method(receptionCancellation, 'preserveAndReverseReceipt', async () => [{ productId: 8, sucursalId: 2, storageId: 5 }]);
  t.mock.method(receptionCancellation, 'closeReconciliationTrace', async () => undefined);
  t.mock.method(integrityService, 'verifyLocationsIntegrity', async ({ locations }) => {
    assert.equal(locations.length, 2);
    throw Object.assign(new Error('Stock y Kardex no terminan con el mismo saldo.'), {
      statusCode: 409,
      code: 'STOCK_KARDEX_PARITY_VIOLATION',
      details: [{ product_id: 8, sucursal_id: 2, storage_id: 5, difference: 1 }],
    });
  });
  t.mock.method(db.History, 'create', async () => { historyCreated = true; });

  await assert.rejects(
    cancellationService.cancelReceivedTransfer({
      transferId: 12,
      actorUserId: 3,
      reason: 'Recepción registrada por error',
      transaction,
    }),
    (error) => error.code === 'STOCK_KARDEX_PARITY_VIOLATION',
  );
  assert.equal(historyCreated, false);
});

test('conserva la entrada original y registra salidas compensatorias sin duplicar Stock', async (t) => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const stock = row({ stock: 15 });
  const createdMovements = [];
  const originalExplicit = {
    id: 91,
    type: 'INPUT',
    quantity: 2,
    cost: 0,
    details: 'EXCEDENTE TRASPASO #TRAS00012',
    id_product: 7,
    id_sucursal: 2,
    id_storage: 5,
  };
  const detail = row({ id: 4, id_product: 7, quantity: 8, quantity_received: 10, cost: 3 });
  const transfer = {
    id: 12,
    cod: 'TRAS00012',
    registry_number: 'P-12',
    id_sucursal_received: 2,
    id_storage_received: 5,
    date_received: new Date('2026-09-10'),
    detailsTransfers: [detail],
  };
  t.mock.method(db.kardexMovements, 'findAll', async () => [originalExplicit]);
  t.mock.method(db.kardexMovements, 'findOne', async () => null);
  t.mock.method(db.kardexMovements, 'create', async (values) => {
    const movement = { id: 100 + createdMovements.length, ...values };
    createdMovements.push(movement);
    return movement;
  });
  t.mock.method(db.Stock, 'findOne', async () => stock);
  const valuedReversals = [];
  t.mock.method(ValuedKardexService.prototype, 'reverseOriginal', async (command) => {
    valuedReversals.push(command);
    return { id: valuedReversals.length };
  });

  const locations = await receptionCancellation.preserveAndReverseReceipt({ transfer, actorUserId: 3, transaction });

  assert.equal(stock.stock, 5);
  assert.equal(createdMovements.length, 3);
  assert.deepEqual(createdMovements.map(({ type }) => type), ['OUTPUT', 'INPUT', 'OUTPUT']);
  assert.match(createdMovements[1].details, /RECEPCIÓN ORIGINAL/);
  assert.match(createdMovements[2].details, /SALIDA COMPENSATORIA/);
  assert.equal(detail.quantity_received, null);
  assert.equal(detail.accounting_status, 'REVERTIDO');
  assert.equal(locations.length, 2);
  assert.equal(valuedReversals.length, 2);
});

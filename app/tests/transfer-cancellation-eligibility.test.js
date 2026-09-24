'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { getCancellationEligibility, getReceptionCancellationAvailability } = require('../services/transfer-cancellation-eligibility.service');

const tx = { LOCK: { UPDATE: 'UPDATE' } };

const installFixture = (t, state) => {
  t.mock.method(db.Transfers, 'findByPk', async () => state.transfer);
  t.mock.method(db.TransferReviewNote, 'findAll', async () => state.notes || []);
  t.mock.method(db.TransferReviewNoteDetail, 'findAll', async () => state.details || []);
  t.mock.method(db.TransferReviewInventoryHold, 'findAll', async () => state.holds || []);
  t.mock.method(db.TransferReviewResolutionAction, 'findAll', async () => state.actions || []);
};

test('distingue traslado pendiente de una recepción anulable', async (t) => {
  const state = { transfer: { id: 1, status: 'PENDING' } };
  installFixture(t, state);
  assert.equal((await getCancellationEligibility({ transferId: 1, transaction: tx })).mode, 'CANCEL_TRANSFER');

  state.transfer = { id: 1, status: 'RECEIVED' };
  state.notes = [{ id: 9, reconciliation_status: 'COMPLETADO', resolved_at: new Date() }];
  state.details = [{ id: 19, reconciliation_status: 'COMPLETADO', quantity_difference: 2, quantity_resolved: 2 }];
  assert.equal((await getCancellationEligibility({ transferId: 1, transaction: tx })).mode, 'CANCEL_RECEPTION');
});

test('bloquea por nota o detalle de conciliación abierto', async (t) => {
  const state = {
    transfer: { id: 1, status: 'RECEIVED' },
    notes: [{ id: 9, reconciliation_status: 'PARCIAL', resolved_at: null }],
    details: [{ id: 19, reconciliation_status: 'EN_REVISION', quantity_difference: 3, quantity_resolved: 1 }],
  };
  installFixture(t, state);
  const result = await getCancellationEligibility({ transferId: 1, transaction: tx });
  assert.equal(result.mode, 'RECEPTION_BLOCKED');
  assert.deepEqual(result.blockers.map(({ type }) => type), ['OPEN_REVIEW_NOTES', 'OPEN_REVIEW_DETAILS']);
});

test('bloquea por retención activa o acción correctiva pendiente', async (t) => {
  const state = {
    transfer: { id: 1, status: 'RECEIVED' },
    notes: [{ id: 9, reconciliation_status: 'COMPLETADO', resolved_at: new Date() }],
    details: [{ id: 19, reconciliation_status: 'COMPLETADO', quantity_difference: 2, quantity_resolved: 2 }],
    holds: [{ id: 29, disposition: 'RETENIDO_SIN_AJUSTE' }],
    actions: [{ id: 39, operation_status: 'REVERSAL_PENDING', operation_type: 'TRANSFER' }],
  };
  installFixture(t, state);
  const result = await getCancellationEligibility({ transferId: 1, transaction: tx });
  assert.equal(result.mode, 'RECEPTION_BLOCKED');
  assert.deepEqual(result.blockers.map(({ type }) => type), ['ACTIVE_INVENTORY_HOLDS', 'PENDING_CORRECTIVE_ACTIONS']);
});

test('expone a la interfaz una decisión basada en pendientes del backend', () => {
  const blocked = getReceptionCancellationAvailability([{
    management_status: 'ACTIVA',
    reconciliation_status: 'COMPLETADO',
    resolved_at: new Date(),
    details: [{
      reconciliation_status: 'COMPLETADO',
      quantity_difference: 2,
      quantity_resolved: 2,
      inventoryHolds: [{ disposition: 'EN_REVISION' }],
    }],
    resolutionActions: [],
  }]);
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.blockers[0].type, 'ACTIVE_INVENTORY_HOLDS');

  const enabled = getReceptionCancellationAvailability([]);
  assert.equal(enabled.enabled, true);
  assert.deepEqual(enabled.blockers, []);
});

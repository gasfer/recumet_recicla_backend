'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { REVIEW_STATUSES } = require('../constants/transfer-review');
const {
  isOpenReview,
  mapOpenReviewNote,
  shouldApplyTransferDateFilter,
} = require('../services/open-reception-review-query.service');

test('el aviso cuenta una boleta antigua aunque la consulta histórica mensual la excluya', () => {
  const reviews = [
    { id: 10, date: '2026-07-15', reconciliation_status: 'PENDIENTE', resolved_at: null, management_status: 'EN_REVISION' },
    { id: 11, date: '2026-09-02', reconciliation_status: 'PENDIENTE', resolved_at: null, management_status: 'EN_REVISION' },
  ];
  const alertIds = reviews.filter(isOpenReview).map(({ id }) => id);
  const historicalSeptemberIds = reviews.filter(({ date }) => date.startsWith('2026-09')).map(({ id }) => id);

  assert.deepEqual(alertIds, [10, 11]);
  assert.deepEqual(historicalSeptemberIds, [11]);
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: true }), false);
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: 'true' }), false);
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: false }), true);
});

test('la bandeja inconclusa respeta únicamente un rango elegido expresamente', () => {
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: true, filterBy: 'MONTH', date1: '09', date2: '2026' }), false);
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: true, filterBy: 'RANGE', date1: '01-07-2026', date2: '31-07-2026' }), true);
  assert.equal(shouldApplyTransferDateFilter({ inconclusive: true, filterBy: 'RANGE', date1: '01-07-2026', date2: '' }), false);
});

test('una nota sólo deja de estar abierta cuando está completada y cerrada', () => {
  assert.equal(isOpenReview({ reconciliation_status: REVIEW_STATUSES.COMPLETED, resolved_at: new Date(), management_status: 'CERRADA' }), false);
  assert.equal(isOpenReview({ reconciliation_status: REVIEW_STATUSES.COMPLETED, resolved_at: null, management_status: 'EN_REVISION' }), true);
  assert.equal(isOpenReview({ reconciliation_status: 'PENDIENTE', resolved_at: null, management_status: 'EN_REVISION' }), true);
  assert.equal(isOpenReview({ reconciliation_status: 'PENDIENTE', resolved_at: null, management_status: 'ELIMINADA' }), false);
});

test('el contrato de boleta abierta calcula pendientes y remanentes sin alterar la nota', () => {
  const note = {
    id: 20,
    registry_number: 'REV-20',
    details: [
      { id: 1, reconciliation_status: 'PARCIAL', quantity_difference: '10.5000', quantity_resolved: '4.2500' },
      { id: 2, reconciliation_status: REVIEW_STATUSES.COMPLETED, quantity_difference: '2', quantity_resolved: '2' },
    ],
  };

  const result = mapOpenReviewNote(note);

  assert.equal(result.pending_items, 1);
  assert.equal(result.details[0].quantity_remaining, 6.25);
  assert.equal(result.details[1].quantity_remaining, 0);
  assert.equal(note.details[0].quantity_remaining, undefined);
});

test('un traslado conserva acciones individuales para cada boleta abierta', () => {
  const notes = [
    { id: 30, registry_number: 'REV-30', reconciliation_status: 'PENDIENTE', details: [] },
    { id: 31, registry_number: 'REV-31', reconciliation_status: 'PARCIAL', details: [] },
  ];

  const group = { transfer_id: 300, open_review_notes: notes.map(mapOpenReviewNote) };

  assert.equal(group.open_review_notes.length, 2);
  assert.deepEqual(group.open_review_notes.map(({ id }) => id), [30, 31]);
});

test('resolver una boleta no retira el traslado mientras otra siga abierta', () => {
  const closed = { reconciliation_status: REVIEW_STATUSES.COMPLETED, resolved_at: new Date(), management_status: 'CERRADA' };
  const open = { reconciliation_status: 'PARCIAL', resolved_at: null, management_status: 'EN_REVISION' };

  assert.equal([closed, open].some(isOpenReview), true);
  assert.equal([closed, { ...open, ...closed }].some(isOpenReview), false);
});

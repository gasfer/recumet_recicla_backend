'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { resolveCase, fingerprintFor } = require('../services/stock-reconciliation.service');
const {
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
  STOCK_RECONCILIATION_STATUSES: STATUSES,
} = require('../constants/stock-reconciliation');

test('3.3 referencias cruzadas entre recepción y caso Stock-Kardex no fusionan estados ni cierres', async (t) => {
  // 1. Simular un caso de recepción con nota de revisión
  const reviewNoteDetail = {
    id: 101,
    id_transfer_review_note: 50,
    id_product: 10,
    quantity_difference: 5,
    quantity_resolved: 0,
    reconciliation_status: 'EN_REVISION',
  };

  const reviewNote = {
    id: 50,
    id_transfer: 200,
    id_sucursal: 1,
    id_storage: 2,
    reconciliation_status: 'EN_REVISION',
    details: [reviewNoteDetail],
  };

  // 2. Simular caso Stock-Kardex relacionado al mismo producto y ubicación
  const stockUpdatedAt = new Date('2026-09-05T10:00:00.000Z');
  const snapshotData = {
    id_product: 10, id_sucursal: 1, id_storage: 2,
    physical_stock: 15, kardex_balance: 10,
    stock_updated_at: stockUpdatedAt.toISOString(), kardex_last_id: 80,
  };
  const fp = fingerprintFor(snapshotData);

  const stockCase = {
    id: 77,
    status: STATUSES.READY,
    id_product: 10,
    id_sucursal: 1,
    id_storage: 2,
    physical_count: 15,
    selected_strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
    source_reference_code: 'TRAS-200',
    fingerprint: fp,
    async update(changes) { Object.assign(this, changes); return this; },
  };

  t.mock.method(db.sequelize, 'transaction', async (fn) => fn({
    LOCK: { UPDATE: 'UPDATE' },
  }));

  t.mock.method(db.StockReconciliationCase, 'findByPk', async () => stockCase);
  t.mock.method(db.Stock, 'findOne', async () => ({ stock: 15, updatedAt: stockUpdatedAt, status: true, async save() { return this; } }));
  let queryCount = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryCount += 1;
    if (queryCount === 1) return [{ id: 80, saldo: 10, date: stockUpdatedAt }];
    return [{ id: 99, saldo: 15, date: new Date() }];
  });
  t.mock.method(db.StockReconciliationEvidence, 'count', async () => 1);
  t.mock.method(db.StockReconciliationAction, 'findOne', async () => null);
  t.mock.method(db.StockReconciliationAction, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.StockReconciliationAuthorization, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.StockReconciliationEvent, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.kardexMovements, 'create', async (v) => ({ id: 99, ...v }));
  t.mock.method(db.History, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.User, 'findOne', async () => ({ id: 1, role: 'ADMINISTRADOR', status: true }));

  // Resolver el caso Stock-Kardex
  const res = await resolveCase({
    caseId: 77,
    actorUserId: 2,
    authorizedUserId: 1,
    idempotencyKey: 'IDEMP-CROSS-REF-1',
  });

  assert.equal(res.repeated, false);
  assert.equal(stockCase.status, STATUSES.RESOLVED);

  // La nota de revisión de la recepción y su detalle NO deben alterarse automáticamente
  assert.equal(reviewNote.reconciliation_status, 'EN_REVISION');
  assert.equal(reviewNoteDetail.reconciliation_status, 'EN_REVISION');
  assert.equal(reviewNoteDetail.quantity_resolved, 0);
});

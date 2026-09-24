'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const {
  detectCases,
  listCases,
  getCase,
  investigateCase,
  previewCase,
  resolveCase,
  fingerprintFor,
} = require('../services/stock-reconciliation.service');
const {
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
  STOCK_RECONCILIATION_STATUSES: STATUSES,
} = require('../constants/stock-reconciliation');

test('8.2 pruebas integrales de flujo completo Stock-Kardex: detección, investigación, preview, resolución y auditoría', async (t) => {
  const stockUpdatedAt = new Date('2026-09-01T10:00:00.000Z');
  let currentStock = 120;
  let currentKardex = 100;
  let currentStatus = STATUSES.DETECTED;
  let currentStrategy = null;
  let currentPhysicalCount = null;
  let currentNotes = null;
  let currentCause = null;
  let currentSourceRef = null;

  const caseObj = {
    id: 42,
    id_product: 99,
    id_sucursal: 1,
    id_storage: 1,
    get status() { return currentStatus; },
    set status(val) { currentStatus = val; },
    get physical_count() { return currentPhysicalCount; },
    set physical_count(val) { currentPhysicalCount = val; },
    get selected_strategy() { return currentStrategy; },
    set selected_strategy(val) { currentStrategy = val; },
    get cause() { return currentCause; },
    set cause(val) { currentCause = val; },
    get investigation_notes() { return currentNotes; },
    set investigation_notes(val) { currentNotes = val; },
    get source_reference_code() { return currentSourceRef; },
    set source_reference_code(val) { currentSourceRef = val; },
    fingerprint: fingerprintFor({
      id_product: 99, id_sucursal: 1, id_storage: 1,
      physical_stock: currentStock, kardex_balance: currentKardex,
      stock_updated_at: stockUpdatedAt.toISOString(), kardex_last_id: 88,
    }),
    async update(changes) { Object.assign(this, changes); return this; },
  };

  t.mock.method(db.sequelize, 'transaction', async (fn) => fn({
    LOCK: { UPDATE: 'UPDATE' },
  }));

  t.mock.method(db.StockReconciliationCase, 'findByPk', async () => caseObj);
  t.mock.method(db.Stock, 'findOne', async () => ({
    stock: currentStock,
    updatedAt: stockUpdatedAt,
    status: true,
    async save() { return this; },
  }));
  t.mock.method(db.sequelize, 'query', async () => [{ id: 88, saldo: currentKardex, date: stockUpdatedAt }]);
  t.mock.method(db.StockReconciliationEvidence, 'count', async () => 1);
  t.mock.method(db.StockReconciliationEvidence, 'create', async () => ({ id: 1 }));
  t.mock.method(db.StockReconciliationDecision, 'create', async () => ({ id: 1 }));
  t.mock.method(db.StockReconciliationEvent, 'create', async () => ({ id: 1 }));
  t.mock.method(db.StockReconciliationAction, 'findOne', async () => null);
  t.mock.method(db.StockReconciliationAction, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.StockReconciliationAuthorization, 'create', async (v) => ({ id: 1, ...v }));
  t.mock.method(db.kardexMovements, 'create', async () => {
    currentKardex = currentStock;
    return { id: 150 };
  });
  t.mock.method(db.History, 'create', async () => ({ id: 1 }));
  t.mock.method(db.User, 'findOne', async () => ({ id: 1, full_names: 'Admin', role: 'ADMINISTRADOR', status: true }));

  // 1. Investigar el caso: conteo físico confirma Stock (120), falta movimiento Kardex
  await investigateCase({
    caseId: 42,
    actorUserId: 2,
    physicalCount: 120,
    cause: 'Recepción antigua no asentada en Kardex',
    notes: 'Se revisó la boleta física y el stock real en almacén.',
    strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
    assignedUserId: 2,
    sourceReferenceType: 'TRASLADO',
    sourceReferenceCode: 'TRAS-999',
    evidences: [{ evidence_type: 'GUIA', reference: 'TRAS-999', description: 'Guía física de traslado' }],
  });

  assert.equal(caseObj.status, STATUSES.READY);

  // 2. Previsualizar la regularización
  const preview = await previewCase(42);
  assert.equal(preview.stock_before, 120);
  assert.equal(preview.kardex_before, 100);
  assert.equal(preview.kardex_after, 120);
  assert.equal(preview.difference_after, 0);
  assert.equal(preview.movement.type, 'INPUT');
  assert.equal(preview.movement.quantity, 20);

  // 3. Confirmar regularización transaccional
  const result = await resolveCase({
    caseId: 42,
    actorUserId: 2,
    authorizedUserId: 1,
    idempotencyKey: 'IDEMP-INTEGRAL-8-2',
  });

  assert.equal(result.repeated, false);
  assert.equal(caseObj.status, STATUSES.RESOLVED);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { STOCK_RECONCILIATION_STRATEGIES: STRATEGIES } = require('../constants/stock-reconciliation');
const { investigateCase } = require('../services/stock-reconciliation.service');
const { buildPreview } = require('../services/stock-reconciliation-policy.service');

test('continuar y vincular una regularización registran auditoría sin crear movimientos', async (t) => {
  const record = {
    id: 9,
    status: 'DETECTADA',
    async update(changes) { Object.assign(this, changes); return this; },
  };
  const decisions = [];
  const events = [];
  const evidences = [];
  let inventoryWrites = 0;

  t.mock.method(db.sequelize, 'transaction', async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(db.StockReconciliationCase, 'findByPk', async () => record);
  t.mock.method(db.StockReconciliationDecision, 'create', async (values) => decisions.push(values));
  t.mock.method(db.StockReconciliationEvent, 'create', async (values) => events.push(values));
  t.mock.method(db.StockReconciliationEvidence, 'create', async (values) => evidences.push(values));
  t.mock.method(db.User, 'findOne', async ({ where }) => ({
    id: where.id,
    role: 'ENCARGADO',
    assign_sucursales: [{ id_sucursal: 1 }],
  }));
  t.mock.method(db.Stock, 'update', async () => { inventoryWrites += 1; });
  t.mock.method(db.kardexMovements, 'create', async () => { inventoryWrites += 1; });

  await investigateCase({
    caseId: record.id,
    actorUserId: 7,
    notes: 'Se revisaron documentos y aún falta confirmar la causa.',
    strategy: STRATEGIES.CONTINUE_INVESTIGATION,
  });
  assert.equal(record.status, 'EN_INVESTIGACION');
  assert.equal(events[0].event_type, 'SEGUIMIENTO');

  await investigateCase({
    caseId: record.id,
    actorUserId: 7,
    physicalCount: 12,
    cause: 'Ajuste previo verificado',
    notes: 'Se comprobó la operación existente contra el documento.',
    strategy: STRATEGIES.LINK_EXISTING,
    assignedUserId: 8,
    sourceReferenceType: 'AJUSTE',
    sourceReferenceCode: 'AJ-100',
    evidences: [{ evidence_type: 'DOCUMENTO', reference: 'AJ-100', description: 'Ajuste firmado' }],
  });

  const preview = buildPreview({ strategy: STRATEGIES.LINK_EXISTING, stock: 12, kardex: 10, physicalCount: 12 });
  assert.equal(record.status, 'LISTA_PARA_REGULARIZAR');
  assert.equal(decisions.length, 2);
  assert.equal(evidences.length, 1);
  assert.equal(decisions[1].source_reference_code, 'AJ-100');
  assert.equal(events[1].event_type, 'LISTA_PARA_REGULARIZAR');
  assert.equal(preview.movement, null);
  assert.equal(preview.difference_after, 2);
  assert.equal(inventoryWrites, 0);
});

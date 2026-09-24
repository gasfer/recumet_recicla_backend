'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const {
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
  STOCK_RECONCILIATION_STATUSES: STATUSES,
} = require('../constants/stock-reconciliation');
const { resolveCase, resolveCases, fingerprintFor } = require('../services/stock-reconciliation.service');

function createResolutionFixture(t, overrides = {}) {
  const stockUpdatedAt = new Date('2026-09-05T10:00:00.000Z');
  const snapshotData = {
    id_product: 10,
    id_sucursal: 1,
    id_storage: 2,
    physical_stock: overrides.physical_stock ?? 12,
    kardex_balance: overrides.kardex_balance ?? 10,
    stock_updated_at: stockUpdatedAt.toISOString(),
    kardex_last_id: 80,
  };
  const currentFingerprint = fingerprintFor(snapshotData);

  const stockRecord = {
    id_product: 10,
    id_sucursal: 1,
    id_storage: 2,
    stock: snapshotData.physical_stock,
    updatedAt: stockUpdatedAt,
    status: true,
    async save() { return this; },
  };

  const caseRecord = {
    id: 5,
    status: STATUSES.READY,
    id_product: 10,
    id_sucursal: 1,
    id_storage: 2,
    physical_count: overrides.physical_count ?? (overrides.strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT ? 10 : 12),
    cause: 'Falta movimiento Kardex de compra',
    selected_strategy: overrides.strategy || STRATEGIES.REGISTER_MISSING_KARDEX,
    source_reference_code: 'COMP-100',
    fingerprint: currentFingerprint,
    async update(changes) { Object.assign(this, changes); return this; },
  };

  const actionsCreated = [];
  const eventsCreated = [];
  const authorizationsCreated = [];
  const kardexCreated = [];
  const historiesCreated = [];
  const initialCase = { ...caseRecord };
  const initialStock = stockRecord.stock;
  let rolledBack = false;

  t.mock.method(db.sequelize, 'transaction', async (fn) => {
    try {
      return await fn({ LOCK: { UPDATE: 'UPDATE' } });
    } catch (error) {
      if (overrides.rollbackOnFailure) {
        stockRecord.stock = initialStock;
        Object.assign(caseRecord, initialCase);
        [actionsCreated, eventsCreated, authorizationsCreated, kardexCreated, historiesCreated]
          .forEach((records) => records.splice(0));
        rolledBack = true;
      }
      throw error;
    }
  });

  t.mock.method(db.StockReconciliationCase, 'findByPk', async () => caseRecord);
  t.mock.method(db.Stock, 'findOne', async () => stockRecord);
  t.mock.method(db.sequelize, 'query', async () => [{ id: 80, saldo: snapshotData.kardex_balance, date: stockUpdatedAt }]);
  t.mock.method(db.StockReconciliationEvidence, 'count', async () => 1);
  t.mock.method(db.StockReconciliationAction, 'findOne', async () => null);
  t.mock.method(db.StockReconciliationAction, 'create', async (values) => {
    actionsCreated.push(values);
    return { id: 1, ...values };
  });
  t.mock.method(db.StockReconciliationAuthorization, 'create', async (values) => {
    authorizationsCreated.push(values);
    return { id: 1, ...values };
  });
  t.mock.method(db.StockReconciliationEvent, 'create', async (values) => {
    eventsCreated.push(values);
    return { id: 1, ...values };
  });
  t.mock.method(db.kardexMovements, 'create', async (values) => {
    kardexCreated.push(values);
    return { id: 99, ...values };
  });
  t.mock.method(db.History, 'create', async (values) => {
    if (overrides.failHistory) throw new Error('Fallo tardío de auditoría');
    historiesCreated.push(values);
    return { id: 1, ...values };
  });

  t.mock.method(db.User, 'findOne', async () => ({
    id: 1,
    full_names: 'Admin User',
    role: 'ADMINISTRADOR',
    status: true,
  }));

  return {
    caseRecord,
    stockRecord,
    actionsCreated,
    eventsCreated,
    authorizationsCreated,
    kardexCreated,
    historiesCreated,
    wasRolledBack: () => rolledBack,
  };
}

test('6.1 REGISTRAR_KARDEX_OMITIDO crea movimiento Kardex compensatorio y cierra a diferencia cero', async (t) => {
  const f = createResolutionFixture(t, {
    strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
    physical_stock: 12,
    kardex_balance: 10,
    physical_count: 12,
  });

  // Mock post-snapshot query para simular que Kardex ahora tiene saldo 12
  let callIndex = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    callIndex += 1;
    if (callIndex === 1) return [{ id: 80, saldo: 10, date: new Date() }];
    return [{ id: 99, saldo: 12, date: new Date() }];
  });

  const res = await resolveCase({
    caseId: 5,
    actorUserId: 2,
    authorizedUserId: 1,
    idempotencyKey: 'IDEMP-6-1',
  });

  assert.equal(res.repeated, false);
  assert.equal(f.kardexCreated.length, 1);
  assert.equal(f.kardexCreated[0].quantity, 2);
  assert.equal(f.kardexCreated[0].type, 'INPUT');
  assert.equal(f.caseRecord.status, STATUSES.RESOLVED);
  assert.equal(f.eventsCreated[0].event_type, 'RESUELTA');
  assert.equal(f.actionsCreated[0].difference_after, 0);
});

test('6.2 AJUSTAR_STOCK_POR_CONTEO modifica Stock físico según conteo verificado y cierra el caso', async (t) => {
  const f = createResolutionFixture(t, {
    strategy: STRATEGIES.ADJUST_STOCK_BY_COUNT,
    physical_stock: 12,
    kardex_balance: 10,
    physical_count: 10,
  });

  t.mock.method(db.sequelize, 'query', async () => [{ id: 80, saldo: 10, date: new Date() }]);

  const res = await resolveCase({
    caseId: 5,
    actorUserId: 2,
    authorizedUserId: 1,
    idempotencyKey: 'IDEMP-6-2',
  });

  assert.equal(res.repeated, false);
  assert.equal(f.kardexCreated.length, 0);
  assert.equal(f.stockRecord.stock, 10);
  assert.equal(f.caseRecord.status, STATUSES.RESOLVED);
  assert.equal(f.eventsCreated[0].event_type, 'RESUELTA');
  assert.equal(f.actionsCreated[0].difference_after, 0);
});

test('AKFP ajusta Stock y Kardex al tercer conteo físico y deja nota trazable', async (t) => {
  const f = createResolutionFixture(t, {
    strategy: STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT,
    physical_stock: 12,
    kardex_balance: 10,
    physical_count: 9,
  });
  f.caseRecord.id_assigned_user = 7;
  t.mock.method(db.StockReconciliationCase, 'findOne', async () => null);
  t.mock.method(db.kardexMovements, 'findOne', async () => null);
  let callIndex = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    callIndex += 1;
    if (callIndex === 1) return [];
    if (callIndex === 2) return [{ id: 80, saldo: 10, date: new Date() }];
    return [{ id: 99, saldo: 9, date: new Date() }];
  });

  const result = await resolveCase({ caseId: 5, actorUserId: 2, authorizedUserId: 1, idempotencyKey: 'AKFP-THIRD-BALANCE' });

  assert.equal(result.repeated, false);
  assert.equal(f.stockRecord.stock, 9);
  assert.equal(f.kardexCreated.length, 1);
  assert.equal(f.kardexCreated[0].type, 'OUTPUT');
  assert.equal(f.kardexCreated[0].quantity, 1);
  assert.equal(f.kardexCreated[0].registry_number, 'AKFP-5');
  assert.equal(f.actionsCreated[0].registry_number, 'AKFP-5');
  assert.equal(f.actionsCreated[0].id_count_responsible_user, 7);
  assert.equal(f.caseRecord.status, STATUSES.RESOLVED);
});

test('AKFP revierte Stock, Kardex, nota, acción y auditoría cuando falla tarde', async (t) => {
  const f = createResolutionFixture(t, {
    strategy: STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT,
    physical_stock: 12,
    kardex_balance: 10,
    physical_count: 9,
    failHistory: true,
    rollbackOnFailure: true,
  });
  f.caseRecord.id_assigned_user = 7;
  t.mock.method(db.StockReconciliationCase, 'findOne', async () => null);
  t.mock.method(db.kardexMovements, 'findOne', async () => null);
  let queryCount = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    queryCount += 1;
    if (queryCount === 1) return [];
    if (queryCount === 2) return [{ id: 80, saldo: 10, date: new Date() }];
    return [{ id: 99, saldo: 9, date: new Date() }];
  });

  await assert.rejects(
    resolveCase({ caseId: 5, actorUserId: 2, authorizedUserId: 1, idempotencyKey: 'AKFP-ROLLBACK-LATE-FAILURE' }),
    /Fallo tardío de auditoría/,
  );

  assert.equal(f.wasRolledBack(), true);
  assert.equal(f.stockRecord.stock, 12);
  assert.equal(f.caseRecord.status, STATUSES.READY);
  assert.equal(f.kardexCreated.length, 0);
  assert.equal(f.actionsCreated.length, 0);
  assert.equal(f.authorizationsCreated.length, 0);
  assert.equal(f.eventsCreated.length, 0);
  assert.equal(f.historiesCreated.length, 0);
});

test('6.4 caso con diferencia residual permanece abierto en INVESTIGATING', async (t) => {
  const f = createResolutionFixture(t, {
    strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
    physical_stock: 12,
    kardex_balance: 10,
    physical_count: 12,
  });

  let callIndex = 0;
  t.mock.method(db.sequelize, 'query', async () => {
    callIndex += 1;
    if (callIndex === 1) return [{ id: 80, saldo: 10, date: new Date() }];
    // Supongamos que tras la acción aún queda diferencia (saldo 11 en vez de 12)
    return [{ id: 99, saldo: 11, date: new Date() }];
  });

  await resolveCase({
    caseId: 5,
    actorUserId: 2,
    authorizedUserId: 1,
    idempotencyKey: 'IDEMP-6-4',
  });

  assert.equal(f.caseRecord.status, STATUSES.INVESTIGATING);
  assert.equal(f.eventsCreated[0].event_type, 'DIFERENCIA_RESIDUAL');
});

test('6.5 procesamiento por lote de casos procesa cada caso de forma independiente', async (t) => {
  createResolutionFixture(t);

  const stockUpdatedAt = new Date('2026-09-05T10:00:00.000Z');
  const validSnapshot = {
    id_product: 10, id_sucursal: 1, id_storage: 2,
    physical_stock: 12, kardex_balance: 10,
    stock_updated_at: stockUpdatedAt.toISOString(), kardex_last_id: 80,
  };
  const fp = fingerprintFor(validSnapshot);

  t.mock.method(db.Stock, 'findOne', async () => ({ stock: 12, updatedAt: stockUpdatedAt, status: true, async save() { return this; } }));
  t.mock.method(db.sequelize, 'query', async () => [{ id: 80, saldo: 10, date: stockUpdatedAt }]);
  t.mock.method(db.StockReconciliationEvidence, 'count', async () => 1);

  t.mock.method(db.StockReconciliationCase, 'findByPk', async (id) => {
    if (id === 5) {
      return {
        id: 5,
        status: STATUSES.READY,
        id_product: 10,
        id_sucursal: 1,
        id_storage: 2,
        physical_count: 12,
        selected_strategy: STRATEGIES.REGISTER_MISSING_KARDEX,
        source_reference_code: 'COMP-100',
        fingerprint: fp,
        async update() { return this; },
      };
    }
    return null;
  });

  const items = [
    { case_id: 5, authorized_user_id: 1, idempotency_key: 'KEY-BATCH-1' },
    { case_id: 999, authorized_user_id: 1, idempotency_key: 'KEY-BATCH-2' },
  ];

  const batchResults = await resolveCases({ cases: items, actorUserId: 2 });
  assert.equal(batchResults.length, 2);
  assert.equal(batchResults[0].ok, true);
  assert.equal(batchResults[1].ok, false);
});

test('un reintento con la misma clave devuelve la acción AKFP sin nuevo efecto', async (t) => {
  const previous = { id: 15, registry_number: 'AKFP-5', case: { id: 5 } };
  t.mock.method(db.StockReconciliationAction, 'findOne', async () => previous);
  const result = await resolveCase({ caseId: 5, actorUserId: 2, authorizedUserId: 1, idempotencyKey: 'AKFP-RETRY' });
  assert.equal(result.repeated, true);
  assert.equal(result.action.registry_number, 'AKFP-5');
});

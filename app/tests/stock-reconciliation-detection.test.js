'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const { detectCases, fingerprintFor } = require('../services/stock-reconciliation.service');

const modelRecord = (values) => ({
  ...values,
  async update(changes) { Object.assign(this, changes); return this; },
  toJSON() {
    const { update, toJSON, ...plain } = this;
    return plain;
  },
});

test('la huella es estable para la misma versión y cambia junto con los saldos', () => {
  const snapshot = {
    id_product: 10, id_sucursal: 1, id_storage: 2,
    physical_stock: 12, kardex_balance: 10,
    stock_updated_at: '2026-09-05T10:00:00.000Z', kardex_last_id: 90,
  };

  assert.equal(fingerprintFor(snapshot), fingerprintFor({ ...snapshot }));
  assert.equal(
    fingerprintFor(snapshot),
    fingerprintFor({ ...snapshot, stock_updated_at: new Date(snapshot.stock_updated_at), kardex_last_id: '90' }),
  );
  assert.notEqual(fingerprintFor(snapshot), fingerprintFor({ ...snapshot, physical_stock: 13 }));
});

test('la detección repetida reutiliza el caso abierto y una ocurrencia posterior crea otro', async (t) => {
  let diagnosticRun = 0;
  let queryCall = 0;
  let activeCase = null;
  let findCall = 0;
  let createCount = 0;
  let eventCount = 0;
  let inventoryWrites = 0;

  t.mock.method(db.sequelize, 'query', async () => {
    queryCall += 1;
    if (queryCall % 2 === 0) return [];
    diagnosticRun += 1;
    const physicalStock = diagnosticRun < 3 ? 12 : 14;
    return [{
      cod: 'MP-010', name: 'MATERIAL', id_product: 10, id_sucursal: 1, id_storage: 2,
      physical_stock: physicalStock, stock_in_review: 0, available_stock: physicalStock,
      kardex_balance: 10, physical_kardex_difference: physicalStock - 10,
      stock_updated_at: `2026-09-0${diagnosticRun}T10:00:00.000Z`, kardex_last_id: 90,
    }];
  });
  t.mock.method(db.sequelize, 'transaction', async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(db.StockReconciliationCase, 'findOne', async () => {
    findCall += 1;
    return findCall === 3 ? null : activeCase;
  });
  t.mock.method(db.StockReconciliationCase, 'create', async (values) => {
    createCount += 1;
    activeCase = modelRecord({ id: createCount, ...values });
    return activeCase;
  });
  t.mock.method(db.StockReconciliationEvent, 'create', async () => { eventCount += 1; });
  t.mock.method(db.Stock, 'update', async () => { inventoryWrites += 1; });
  t.mock.method(db.kardexMovements, 'create', async () => { inventoryWrites += 1; });
  t.mock.method(db.Transfers, 'update', async () => { inventoryWrites += 1; });

  const first = await detectCases({ idSucursal: 1, idStorage: 2, actorUserId: 7 });
  const repeated = await detectCases({ idSucursal: 1, idStorage: 2, actorUserId: 7 });
  activeCase = null;
  const laterOccurrence = await detectCases({ idSucursal: 1, idStorage: 2, actorUserId: 7 });

  assert.deepEqual([first.created, repeated.created, laterOccurrence.created], [1, 0, 1]);
  assert.equal(createCount, 2);
  assert.equal(eventCount, 2);
  assert.equal(inventoryWrites, 0);
  assert.notEqual(first.cases[0].fingerprint, laterOccurrence.cases[0].fingerprint);
});

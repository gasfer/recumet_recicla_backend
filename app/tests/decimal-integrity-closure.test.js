'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withDecimalPolicy } = require('../helpers/decimal-operation-context');
const { getDecimalPlaces, setDecimalPlaces, resolveOperationalCompany } = require('../helpers/decimals-value');
const { exactAdd, exactSubtract, inventoryQuantity } = require('../helpers/number-formatter');
const { validateQuantity } = require('../services/inventory-posting.service');
const db = require('../database/config');
const integrity = require('../services/stock-kardex-integrity.service');
const closure = require('../services/transfer-review-closure.service');
const { recordInventoryRejection } = require('../services/inventory-rejection-audit.service');

test('dos operaciones concurrentes conservan política propia durante actualización 4→2', async () => {
  let unblock;
  const barrier = new Promise((resolve) => { unblock = resolve; });
  const old = withDecimalPolicy({ places: 4, inventory: true }, async () => {
    await barrier;
    assert.equal(getDecimalPlaces(), 4);
    assert.equal(inventoryQuantity('1.005'), '1.0050');
  });
  await withDecimalPolicy({ places: 2, inventory: true }, async () => {
    setDecimalPlaces(2);
    assert.equal(inventoryQuantity('1.005'), '1.01');
    assert.equal(exactAdd('10.1234', '1.01'), '11.1334');
    assert.throws(() => validateQuantity('0.0004'), /mayor a cero/);
    unblock();
  });
  await old;
});

test('paridad detecta 0,0001 y duplicados compensados sin redondear por precisión activa', async (t) => {
  t.mock.method(db.Stock, 'findOne', async () => ({ stock: '10.1234' }));
  let projection = { kardex_balance: '10.1233', physical_kardex_balance: '10.1233', duplicate_effects: 0 };
  t.mock.method(db.sequelize, 'query', async () => [projection]);
  await withDecimalPolicy({ places: 0, inventory: true }, async () => {
    const result = await integrity.getStockKardexIntegrity({ productId: 1, sucursalId: 1, storageId: 1 });
    assert.equal(result.difference, '0.0001');
    assert.equal(result.consistent, false);
    await assert.rejects(integrity.verifyLocationsIntegrityPreserved({ locations: [{ productId: 1, sucursalId: 1, storageId: 1 }], beforeDiagnostics: [result] }), { code: 'STOCK_KARDEX_PARITY_VIOLATION' });
    projection = { kardex_balance: '10.1234', physical_kardex_balance: '10.1234', duplicate_effects: 1 };
    await assert.rejects(integrity.verifyStockKardexIntegrity({ productId: 1, sucursalId: 1, storageId: 1 }), { code: 'STOCK_KARDEX_PARITY_VIOLATION' });
  });
});

test('empresa operativa se resuelve sin id fijo y rechaza selección ambigua', async (t) => {
  let companies = [{ id: 7, decimals: 4 }];
  t.mock.method(db.Company, 'findAll', async () => companies);
  assert.equal((await resolveOperationalCompany()).id, 7);
  companies = [...companies, { id: 9, decimals: 2 }];
  await assert.rejects(resolveOperationalCompany(), /única empresa/);
});

test('actualización decimal valida rango y audita dentro de la transacción', async (t) => {
  const { updateCompany } = require('../controllers/company.controller');
  const { normalizeDecimalPlaces } = require('../helpers/decimals-value');
  for (const value of [null, undefined, '', true, 2.5, -1, 5]) assert.throws(() => normalizeDecimalPlaces(value));
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  t.mock.method(db.sequelize, 'transaction', async (operation) => operation(transaction));
  const company = { id: 7, decimals: 4, async update(values, options) { assert.equal(options.transaction, transaction); Object.assign(this, values); } };
  t.mock.method(db.Company, 'findByPk', async () => company);
  const history = [];
  t.mock.method(db.History, 'create', async (values, options) => { assert.equal(options.transaction, transaction); history.push(values); });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await updateCompany({ params: { id: 7 }, body: { decimals: 2 }, userAuth: { id: 8 } }, response);
  assert.equal(response.code, 201);
  assert.equal(company.decimals, 2);
  assert.equal(history[0].id_user, 8);
  assert.equal(JSON.parse(history[0].query).previousDecimals, 4);
  await updateCompany({ params: { id: 7 }, body: { decimals: 5 }, userAuth: { id: 8 } }, response);
  assert.equal(response.code, 422);
  assert.equal(history.length, 1);
});

test('cierre rechaza guía pendiente aunque remanente y retención sean cero', async (t) => {
  t.mock.method(db.TransferReviewNote, 'findByPk', async () => ({ id_product: 1, id_sucursal: 1, id_storage: 1, details: [{ id_product: 1, quantity_difference: '0.0004', quantity_resolved: '0.0004', inventoryHolds: [], resolutionActions: [{ quantity: '0.0004', operation_status: 'PENDING_RECEPTION' }] }] }));
  await assert.rejects(closure.assertReviewClosure({ noteId: 1 }), { code: 'REVIEW_CLOSURE_REJECTED' });
});

test('auditoría es independiente del rollback y respuesta filtra sucursales', async (t) => {
  const writes = [];
  t.mock.method(db.History, 'create', async (row, options) => { writes.push({ row, options }); });
  const result = await recordInventoryRejection(Object.assign(new Error('Diferencia'), { code: 'STOCK_KARDEX_PARITY_VIOLATION', statusCode: 409, details: [{ sucursal_id: 1, difference: '0.0004' }, { sucursal_id: 2, difference: '8' }] }), { id: 8, role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }] });
  assert.equal(writes[0].options, undefined);
  assert.equal(JSON.parse(writes[0].row.query).details.length, 2);
  assert.equal(result.details.length, 1);
  assert.ok(result.correlationId);
  assert.equal(exactSubtract('10.1234', '10.1230'), '0.0004');
});

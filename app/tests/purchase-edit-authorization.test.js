'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';
const db = require('../database/config');
const service = require('../services/purchase-authorization.service');
const audit = require('../services/purchase-audit.service');
const { updateInput } = require('../controllers/input.controller');
const transaction = { LOCK: { SHARE: 'SHARE', UPDATE: 'UPDATE' } };

test('edición de precio conserva creador y guarda ejecutor autorizador y motivo en cada evento', async t => {
  let committed = false;
  const tx = { ...transaction, commit: async () => { committed = true; }, rollback: async () => {} };
  t.mock.method(db.sequelize, 'transaction', async () => tx);
  t.mock.method(db.sequelize, 'query', async () => []);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  t.mock.method(db.User, 'findByPk', async () => ({ id: 9, status: true, role: 'ENCARGADO' }));
  const detail = { id: 11, id_product: 2, quantity: 50, cost: 14, total: 700, status: 'ACTIVE',
    async update(data) { Object.assign(this, data); return this; } };
  const original = { id: 7, id_user: 1, cod: 'TEST', id_sucursal: 3, id_storage: 4, type: 'CONTADO',
    type_registry: 'SIN FICHA', registry_number: 'SFC-7', total: 700, detailsInput: [detail] };
  let payload;
  let reads = 0;
  t.mock.method(db.Input, 'findByPk', async () => ++reads === 1 ? original : { ...original, ...payload });
  t.mock.method(db.Input, 'update', async data => { payload = data; return [1]; });
  const stock = { id_product: 2, id_sucursal: 3, id_storage: 4, stock: 50, save: async () => {} };
  t.mock.method(db.Stock, 'findOne', async () => stock);
  t.mock.method(db.History, 'create', async () => ({}));
  const events = [];
  t.mock.method(audit, 'createEvent', async event => { events.push(event); return event; });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await updateInput({ get: () => null, params: { id_input: 7 }, userAuth: { id: 5 }, body: {
    input_data: { id_sucursal: 3, id_storage: 4, id_provider: 6, id_user: 999, total: 725,
      type_registry: 'SIN FICHA', pay_to_credit: false, audit_reason: 'Precio acordado corregido', id_authorizer_user: 9 },
    input_details: [{ id_product: 2, quantity: 50, cost: 14.5, total: 725, status: 'ACTIVE' }],
  } }, res);
  assert.equal(res.code, 201);
  assert.equal(committed, true);
  assert.equal(stock.stock, 50);
  assert.equal(payload.id_user, undefined);
  assert.equal(original.id_user, 1);
  assert.equal(detail.id, 11);
  assert.ok(events.some(event => event.eventType === 'PRICE_CHANGED'));
  for (const event of events) {
    assert.equal(event.actorUserId, 5);
    assert.equal(event.authorizerUserId, 9);
    assert.equal(event.reason, 'Precio acordado corregido');
  }
});

test('asignación inicial guarda precios y trazabilidad sin motivo ni autorizador', async t => {
  let committed = false;
  const tx = { ...transaction, commit: async () => { committed = true; }, rollback: async () => {} };
  t.mock.method(db.sequelize, 'transaction', async () => tx);
  t.mock.method(db.sequelize, 'query', async () => []);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  const authorizerLookup = t.mock.method(db.User, 'findByPk', async () => { throw Error('No debe consultar autorizadores'); });
  const detail = { id: 11, id_product: 2, quantity: 50, cost: 0, total: 0, status: 'ACTIVE',
    async update(data) { Object.assign(this, data); return this; } };
  const original = { id: 7, id_user: 1, cod: 'TEST', id_sucursal: 3, id_storage: 4, id_provider: 6,
    id_scales: 1, type: 'CONTADO', type_payment: 'EFECTIVO', type_registry: 'SIN FICHA',
    registry_number: 'SFC-7', discount: 0, total: 0, status: 'ACTIVE', createdAt: new Date(),
    detailsInput: [detail], accounts_payable: null };
  let payload;
  let reads = 0;
  t.mock.method(db.Input, 'findByPk', async () => ++reads === 1 ? original : { ...original, ...payload });
  t.mock.method(db.Input, 'update', async data => { payload = data; return [1]; });
  const stock = { id_product: 2, id_sucursal: 3, id_storage: 4, stock: 50, save: async () => {} };
  t.mock.method(db.Stock, 'findOne', async () => stock);
  t.mock.method(db.History, 'create', async () => ({}));
  const events = [];
  t.mock.method(audit, 'createEvent', async event => { events.push(event); return event; });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };

  await updateInput({ get: () => null, params: { id_input: 7 }, userAuth: { id: 5 }, body: {
    input_data: { id_sucursal: 3, id_storage: 4, id_provider: 6, id_scales: 1, total: 700, sumas: 700,
      discount: 0, status: 'ACTIVE', type_payment: 'EFECTIVO', type_registry: 'SIN FICHA', pay_to_credit: false, on_account: 0 },
    input_details: [{ id_product: 2, quantity: 50, cost: 14, total: 700, status: 'ACTIVE' }],
  } }, res);

  assert.equal(res.code, 201);
  assert.equal(committed, true);
  assert.equal(authorizerLookup.mock.callCount(), 0);
  assert.ok(events.some(event => event.eventType === 'PRICE_CHANGED'));
  for (const event of events) {
    assert.equal(event.authorizerUserId, undefined);
    assert.equal(event.reason, '');
    assert.equal(event.actorUserId, 5);
  }
});

test('regularización vencida sin motivo se rechaza antes de modificar', async t => {
  let rolledBack = false;
  const tx = { ...transaction, rollback: async () => { rolledBack = true; } };
  t.mock.method(db.sequelize, 'transaction', async () => tx);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  const original = { id: 7, type: 'CONTADO', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), detailsInput: [
    { id: 1, id_product: 2, quantity: 5, cost: 2, total: 10, status: 'ACTIVE' },
    { id: 2, id_product: 3, quantity: 5, cost: 0, total: 0, status: 'ACTIVE' },
  ] };
  t.mock.method(db.Input, 'findByPk', async () => original);
  const update = t.mock.method(db.Input, 'update', async () => { throw Error('No debe modificar'); });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };

  await updateInput({ get: () => null, params: { id_input: 7 }, userAuth: { id: 3 }, body: {
    input_data: { pay_to_credit: false, total: 20, sumas: 20 },
    input_details: [
      { id_product: 2, quantity: 5, cost: 2, total: 10, status: 'ACTIVE' },
      { id_product: 3, quantity: 5, cost: 2, total: 10, status: 'ACTIVE' },
    ],
  } }, res);

  assert.equal(res.code, 422);
  assert.equal(res.body.code, 'PURCHASE_EDIT_AUTHORIZATION_REQUIRED');
  assert.match(res.body.errors[0].msg, /24 horas/);
  assert.equal(update.mock.callCount(), 0);
  assert.equal(rolledBack, true);
});

test('listado expone solo nombres roles e identificadores de responsables activos', async t => {
  t.mock.method(db.User, 'findAll', async options => {
    assert.equal(options.where.status, true);
    assert.deepEqual(options.where.role[db.Sequelize.Op.in], ['ADMINISTRADOR', 'ENCARGADO']);
    assert.deepEqual(options.attributes, ['id', 'full_names', 'role']);
    return [];
  });
  await service.listAuthorizers();
});
test('rechaza autorización ausente o identificadores inválidos sin consultar usuarios', async t => {
  const lookup = t.mock.method(db.User, 'findByPk', async () => { throw Error('No debe consultar'); });
  for (const id of [null, undefined, '', 0, -1, 'abc', 1.5]) {
    await assert.rejects(service.resolveAuthorizer(id, transaction), { status: 422 });
  }
  assert.equal(lookup.mock.callCount(), 0);
});
test('permite administradores y encargados activos y rechaza otros roles o usuarios inactivos', async t => {
  let current;
  t.mock.method(db.User, 'findByPk', async (_id, options) => {
    assert.equal(options.transaction, transaction);
    assert.equal(options.lock, transaction.LOCK.SHARE);
    return current;
  });
  for (const role of ['ADMINISTRADOR', 'ENCARGADO']) {
    current = { id: 1, role, status: true };
    assert.equal((await service.resolveAuthorizer(1, transaction)).id, 1);
  }
  for (const user of [null, { role: 'OPERADOR', status: true }, { role: 'ADMINISTRADOR', status: false }]) {
    current = user;
    await assert.rejects(service.resolveAuthorizer(1, transaction), { status: 422 });
  }
});

for (const [reason, id, message] of [['', 1, /motivo/], ['Ajuste acordado', null, /responsable/]]) {
  test(`edición conserva validaciones obligatorias antes de modificar inventario: ${message}`, async t => {
    let rolledBack = false;
    t.mock.method(db.sequelize, 'transaction', async () => ({ ...transaction, rollback: async () => { rolledBack = true; } }));
    t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
    t.mock.method(db.Input, 'findByPk', async (_id, options) => {
      assert.equal(options.lock.of, db.Input);
      assert.equal(options.lock.level, 'UPDATE');
      return { id: 7, detailsInput: [] };
    });
    const update = t.mock.method(db.Input, 'update', async () => { throw Error('No debe modificar'); });
    t.mock.method(console, 'log', () => {});
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await updateInput({ get: () => null, params: { id_input: 7 }, userAuth: { id: 3 },
      body: { input_data: { audit_reason: reason, id_authorizer_user: id }, input_details: [] } }, res);
    assert.equal(res.code, 422);
    assert.match(res.body.errors[0].msg, message);
    assert.equal(update.mock.callCount(), 0);
    assert.equal(rolledBack, true);
  });
}

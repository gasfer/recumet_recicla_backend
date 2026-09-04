'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';
const db = require('../database/config');
const audit = require('../services/purchase-audit.service');
const { newInput } = require('../controllers/input.controller');
const { newAbonoAccountPayable, deleteAbonoAccountPayable } = require('../controllers/accounts_payables.controller');
const { getPurchaseTraceability, getProviderTraceability } = require('../controllers/purchase_traceability.controller');
const notificationService = require('../services/notification.service');

const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const tx = () => ({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' }, committed: false, rolledBack: false,
  async commit() { this.committed = true; }, async rollback() { this.rolledBack = true; } });
const plain = (data) => ({ ...data, async save() { return this; }, get() { return { ...this }; } });

const prepareCreation = (t, credit) => {
  const transaction = tx();
  const events = [];
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  t.mock.method(audit, 'createCorrelationId', () => '39c8c6c2-f69d-4f4b-9d8a-d41466e81e65');
  t.mock.method(db.Input, 'findOne', async () => null);
  t.mock.method(db.Input, 'create', async data => plain({ id: 10, status: 'ACTIVE', ...data }));
  t.mock.method(db.Input, 'count', async () => 1);
  t.mock.method(db.DetailsInput, 'create', async data => plain({ id: 20, status: 'ACTIVE', ...data }));
  t.mock.method(db.Stock, 'findOne', async () => null);
  t.mock.method(db.Stock, 'create', async data => data);
  t.mock.method(db.History, 'create', async data => data);
  t.mock.method(db.AccountsPayable, 'create', async data => plain({ id: 30, ...data }));
  t.mock.method(db.AccountsPayable, 'count', async () => 1);
  t.mock.method(db.AbonosAccountsPayable, 'create', async data => plain({ id: 40, ...data }));
  t.mock.method(audit, 'createEvent', async event => { events.push(event); return event; });
  const req = { get: name => name === 'Idempotency-Key' ? `create-${credit}` : null, userAuth: { id: 7 }, body: {
    input_data: { id_sucursal: 2, id_provider: 3, id_storage: 4, type_registry: 'CON FICHA', registry_number: 'B-1',
      total: 100, on_account: credit ? 20 : 0, pay_to_credit: credit, status: 'ACTIVE' },
    input_details: [{ id_product: 5, quantity: 2, cost: 50, total: 100, status: 'ACTIVE' }],
  } };
  return { transaction, events, req };
};

test('7.1 creación al contado conserva registrador y confirma compra y detalle atómicamente', async t => {
  const { transaction, events, req } = prepareCreation(t, false);
  const res = response();
  await newInput(req, res);
  assert.equal(res.code, 201);
  assert.equal(transaction.committed, true);
  assert.equal(req.body.input_data.id_user, 7);
  assert.deepEqual(events.map(event => event.eventType), ['PURCHASE_CREATED', 'DETAIL_ADDED']);
  assert.ok(events.every(event => event.transaction === transaction && event.actorUserId === 7));
});

test('7.1 creación a crédito correlaciona compra detalle cuenta y cuota inicial', async t => {
  const { transaction, events, req } = prepareCreation(t, true);
  const res = response();
  await newInput(req, res);
  assert.equal(res.code, 201);
  assert.equal(transaction.committed, true);
  assert.deepEqual(events.map(event => event.eventType),
    ['PURCHASE_CREATED', 'DETAIL_ADDED', 'ACCOUNT_PAYABLE_CREATED', 'PAYMENT_CREATED']);
  assert.equal(new Set(events.map(event => event.correlationId)).size, 1);
});

test('7.2 diferencias identifican precio cantidad alta y retiro conservando identificadores', () => {
  const changes = audit.diffDetails(
    [{ id: 1, id_product: 10, quantity: 2, cost: 5, status: 'ACTIVE' }, { id: 2, id_product: 20, quantity: 4, cost: 3, status: 'ACTIVE' }],
    [{ id: 1, id_product: 10, quantity: 3, cost: 6, status: 'ACTIVE' }, { id: 3, id_product: 30, quantity: 1, cost: 8, status: 'ACTIVE' }],
  );
  assert.equal(changes.find(item => item.kind === 'PRICE_CHANGED').after.id, 1);
  assert.deepEqual(changes.find(item => item.kind === 'PRICE_CHANGED').changes.map(item => item.field).sort(), ['cost', 'quantity']);
  assert.equal(changes.find(item => item.kind === 'ADDED').after.id, 3);
  assert.equal(changes.find(item => item.kind === 'REMOVED').before.id, 2);
});

test('7.3 registrar abono actualiza saldo y genera evento ligado a compra cuenta y pago', async t => {
  const transaction = tx();
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  const account = plain({ id: 30, id_input: 10, id_sucursal: 2, total: 100, monto_abonado: 20, monto_restante: 80, status_account: 'PENDIENTE', description: 'Compra' });
  t.mock.method(db.AccountsPayable, 'findByPk', async () => account);
  t.mock.method(db.AbonosAccountsPayable, 'create', async data => plain({ id: 40, ...data }));
  t.mock.method(db.Input, 'findByPk', async () => plain({ id: 10, id_sucursal: 2 }));
  t.mock.method(db.History, 'create', async data => data);
  const events = [];
  t.mock.method(audit, 'createEvent', async event => { events.push(event); return event; });
  const res = response();
  await newAbonoAccountPayable({ get: () => 'pay-1', userAuth: { id: 7 }, body: {
    id_account_payable: 30, monto_abono: 30, date_abono: new Date(), type_payment: 'EFECTIVO',
  } }, res);
  assert.equal(res.code, 201);
  assert.equal(account.monto_abonado, 50);
  assert.equal(account.monto_restante, 50);
  assert.equal(events[0].eventType, 'PAYMENT_CREATED');
  assert.equal(events[0].input.id, 10);
  assert.equal(events[0].accountId, 30);
  assert.equal(events[0].paymentId, 40);
});

test('7.3 anular abono exige motivo, conserva el pago y restablece el saldo con trazabilidad', async t => {
  const transaction = tx();
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => null);
  t.mock.method(audit, 'createCorrelationId', () => 'void-correlation');
  const payment = plain({ id: 40, id_account_payable: 30, monto_abono: 30, status: true,
    async update(data) { Object.assign(this, data); return this; } });
  const account = plain({ id: 30, id_input: 10, id_sucursal: 2, total: 100,
    monto_abonado: 50, monto_restante: 50, status_account: 'PAGADO', input: { cod: 'CP-10' } });
  t.mock.method(db.AbonosAccountsPayable, 'findByPk', async () => payment);
  t.mock.method(db.AbonosAccountsPayable, 'update', async () => [1]);
  t.mock.method(db.AccountsPayable, 'findByPk', async () => account);
  t.mock.method(db.Input, 'findByPk', async () => plain({ id: 10, id_provider: 3, id_sucursal: 2 }));
  t.mock.method(db.AbonosAccountsPayableMultiple, 'findOne', async () => null);
  t.mock.method(db.History, 'create', async data => data);
  t.mock.method(notificationService, 'notifyAdmins', async () => []);
  const events = [];
  t.mock.method(audit, 'createEvent', async event => { events.push(event); return event; });

  const res = response();
  await deleteAbonoAccountPayable({ params: { id_abono: 40 }, get: () => 'void-1',
    userAuth: { id: 7, full_names: 'OPERADOR' }, body: { reason: 'Pago registrado por duplicado' }, query: {} }, res);

  assert.equal(res.code, 201);
  assert.equal(transaction.committed, true);
  assert.equal(payment.status, false);
  assert.equal(payment.void_reason, 'Pago registrado por duplicado');
  assert.equal(account.monto_abonado, 20);
  assert.equal(account.monto_restante, 80);
  assert.equal(account.status_account, 'PENDIENTE');
  assert.equal(events[0].eventType, 'PAYMENT_VOIDED');
  assert.equal(events[0].reason, 'Pago registrado por duplicado');
  assert.equal(events[0].input.id, 10);
  assert.equal(events[0].accountId, 30);
  assert.equal(events[0].paymentId, 40);
});

test('7.4 una falla de auditoría revierte la creación completa', async t => {
  const { transaction, req } = prepareCreation(t, false);
  t.mock.restoreAll();
  const prepared = prepareCreation(t, false);
  t.mock.method(audit, 'createEvent', async () => { throw new Error('fallo de auditoría'); });
  t.mock.method(console, 'log', () => {});
  const res = response();
  await newInput(prepared.req, res);
  assert.equal(res.code, 500);
  assert.equal(prepared.transaction.rolledBack, true);
  assert.equal(prepared.transaction.committed, false);
  void transaction; void req;
});

test('7.4 un reintento idempotente no vuelve a crear la compra', async t => {
  const transaction = tx();
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(audit, 'findEventByIdempotencyKey', async () => ({ id_input: 99 }));
  const create = t.mock.method(db.Input, 'create', async () => { throw new Error('no debe crear'); });
  const res = response();
  await newInput({ get: () => 'same-key', userAuth: { id: 7 }, body: { input_data: {}, input_details: [] } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.repeated, true);
  assert.equal(res.body.id_input, 99);
  assert.equal(transaction.rolledBack, true);
  assert.equal(create.mock.callCount(), 0);
});

test('7.5 consulta por boleta rechaza sucursales no asignadas antes de leer eventos', async t => {
  t.mock.method(db.Input, 'findByPk', async () => ({ id: 10, id_sucursal: 8 }));
  const eventQuery = t.mock.method(db.PurchaseAuditEvent, 'findAndCountAll', async () => ({ rows: [], count: 0 }));
  const res = response();
  await getPurchaseTraceability({ params: { id_input: 10 }, query: {}, userAuth: { role: 'ENCARGADO', assign_sucursales: [{ id_sucursal: 2 }] } }, res);
  assert.equal(res.code, 403);
  assert.equal(eventQuery.mock.callCount(), 0);
});

test('7.5 consulta por proveedor pagina filtra y calcula saldos desde cuentas por pagar', async t => {
  t.mock.method(db.Provider, 'findByPk', async () => ({ id: 3, full_names: 'Proveedor' }));
  let allCalls = 0;
  t.mock.method(db.Input, 'findAll', async options => {
    assert.deepEqual(options.where.id_sucursal[db.Sequelize.Op.in], [2]);
    return [
      { id: 10, total: 100, status: 'ACTIVE', accounts_payable: { monto_abonado: 40, monto_restante: 60, status: true } },
      { id: 11, total: 25, status: 'INACTIVE', accounts_payable: null },
    ];
  });
  t.mock.method(db.Input, 'findAndCountAll', async options => {
    allCalls += 1;
    assert.equal(options.limit, 10);
    assert.equal(options.offset, 10);
    assert.deepEqual(options.where.id_sucursal[db.Sequelize.Op.in], [2]);
    return { rows: [{ id: 10 }], count: 12 };
  });
  t.mock.method(db.PurchaseAuditEvent, 'findAll', async options => {
    assert.equal(options.where.event_type, 'PAYMENT_CREATED');
    assert.equal(options.where.id_actor_user, 7);
    return [{ id: 50, id_input: 10 }];
  });
  const res = response();
  await getProviderTraceability({ params: { id_provider: 3 }, query: { page: 2, limit: 10, event_type: 'PAYMENT_CREATED', id_user: '7', status: 'ACTIVE' },
    userAuth: { role: 'ENCARGADO', assign_sucursales: [{ id_sucursal: 2 }] } }, res);
  assert.equal(allCalls, 1);
  assert.deepEqual(res.body.traceability.totals, { purchased: 100, paid: 40, pending: 60, voided: 25 });
  assert.deepEqual(res.body.traceability.pagination, { page: 2, limit: 10, total: 12, pages: 2 });
  assert.equal(res.body.traceability.events[0].id_input, 10);
});

test('7.5 las rutas de trazabilidad exigen vista de Compras y autorizadores exige modificación', () => {
  const router = require('../routes/purchase_traceability');
  const expected = [
    ['/purchase/:id_input', 'view'],
    ['/provider/:id_provider', 'view'],
    ['/authorizers', 'update'],
  ];

  for (const [path, action] of expected) {
    const route = router.stack.find((layer) => layer.route?.path === path)?.route;
    assert.ok(route, `Falta registrar ${path}`);
    assert.equal(route.stack.some((layer) => layer.handle.modulePermission?.module === 'COMPRAS'
      && layer.handle.modulePermission?.action === action), true);
  }
});

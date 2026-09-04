'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';
const db = require('../database/config');
const notifications = require('../services/notification.service');
const transfers = require('../controllers/transfers.controller');
const classifications = require('../controllers/classified.controller');

// No connection is opened: all persistence boundaries are replaced per test.
function fixture(t) {
  const writes = [];
  const transaction = {
    commit: async () => writes.push('commit'),
    rollback: async () => writes.push('rollback'),
  };
  t.mock.method(db.sequelize, 'transaction', async () => transaction);
  t.mock.method(db.sequelize, 'query', async () => []);
  const record = (data) => ({ ...data, save: async (options) => {
    assert.equal(options.transaction, transaction);
  } });
  const stocks = [record({ id_product: 1, id_sucursal: 2, id_storage: 3, stock: 20,
    product: { cod: 'MP-1', name: 'Material' } }),
  record({ id_product: 4, id_sucursal: 2, id_storage: 3, stock: 10 })];
  t.mock.method(db.Stock, 'findOne', async ({ where, transaction: tx }) => {
    assert.equal(tx, transaction);
    return stocks.find((stock) => stock.id_product === where.id_product);
  });
  t.mock.method(db.History, 'create', async (data, options) => {
    assert.equal(options.transaction, transaction);
    writes.push(data);
  });
  const movements = t.mock.method(db.kardexMovements, 'create', async () => {
    throw new Error('The ordinary module must not duplicate the document-derived Kardex entry');
  });
  t.mock.method(notifications, 'notifyAdmins', async (_data, tx) => assert.equal(tx, transaction));
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { writes, transaction, record, stocks, movements, res,
    actor: { id: 9, full_names: 'Test' } };
}

test('crear traslado conserva documento, detalle, salida física e historial sin Kardex adicional', async (t) => {
  const f = fixture(t);
  let document;
  let detail;
  t.mock.method(db.Transfers, 'count', async () => 2);
  t.mock.method(db.Transfers, 'create', async (data, options) => {
    assert.equal(options.transaction, f.transaction);
    return (document = f.record({ ...data, id: 7 }));
  });
  t.mock.method(db.DetailsTransfers, 'create', async (data, options) => {
    assert.equal(options.transaction, f.transaction);
    detail = { ...data };
  });
  await transfers.newTransfer({ userAuth: f.actor, body: {
    transfer_data: { id_sucursal_send: 2, id_storage_send: 3, id_sucursal_received: 5, type_registry: 'SIN FICHA' },
    transfer_details: [{ id_product: 1, quantity: 6 }],
  } }, f.res);
  assert.equal(f.res.code, 201);
  assert.equal(f.res.body.id_transfer, 7);
  assert.equal(document.status, 'PENDING');
  assert.equal(document.id_user_send, 9);
  assert.equal(document.cod, 'TRAS00007');
  assert.equal(detail.id_transfer, 7);
  assert.equal(f.stocks[0].stock, 14);
  assert.equal(f.writes[0].action, 'CREATE');
  assert.equal(f.writes.at(-1), 'commit');
  assert.equal(f.movements.mock.callCount(), 0);
});

test('anular traslado pendiente restaura stock y conserva documento e historial', async (t) => {
  const f = fixture(t);
  const document = f.record({ id: 7, cod: 'TRAS00007', status: 'PENDING', id_sucursal_send: 2,
    id_storage_send: 3, detailsTransfers: [{ id_product: 1, quantity: 6 }] });
  t.mock.method(db.Transfers, 'findOne', async ({ where }) => {
    assert.equal(where.status, 'PENDING');
    return document;
  });
  await transfers.deleteTransfer({ userAuth: f.actor, params: { id_transfer: 7 } }, f.res);
  assert.equal(f.res.code, 201);
  assert.equal(document.status, 'ANULADO');
  assert.equal(f.stocks[0].stock, 26);
  assert.equal(f.writes[0].action, 'DELETE');
  assert.equal(f.writes.at(-1), 'commit');
  assert.equal(f.movements.mock.callCount(), 0);
});

test('crear clasificación aplica salida e ingreso y conserva los correlativos ordinarios', async (t) => {
  const f = fixture(t);
  let document;
  let detail;
  t.mock.method(db.Classified, 'findOne', async () => ({ number_registry: 'SFCL-00008' }));
  t.mock.method(db.Classified, 'count', async () => 3);
  t.mock.method(db.Classified, 'create', async (data, options) => {
    assert.equal(options.transaction, f.transaction);
    return (document = f.record({ ...data, id: 12 }));
  });
  t.mock.method(db.DetailsClassified, 'create', async (data, options) => {
    assert.equal(options.transaction, f.transaction);
    detail = { ...data };
  });
  await classifications.newClassified({ userAuth: f.actor, body: {
    classified_data: { id_product: 1, quantity_product: 6, id_sucursal: 2, id_storage: 3, type_registry: 'SIN FICHA' },
    classified_details: [{ id_product: 4, quantity: 6 }],
  } }, f.res);
  assert.equal(f.res.code, 201);
  assert.equal(f.res.body.id_classified, 12);
  assert.equal(document.number_registry, 'SFCL-00009');
  assert.equal(document.cod, 'CL00003');
  assert.equal(document.id_user, 9);
  assert.equal(detail.id_classified, 12);
  assert.deepEqual(f.stocks.map(({ stock }) => stock), [14, 16]);
  assert.equal(f.writes[0].action, 'CREATE');
  assert.equal(f.writes.at(-1), 'commit');
  assert.equal(f.movements.mock.callCount(), 0);
});

test('anular clasificación restaura ambos productos sin insertar compensaciones adicionales', async (t) => {
  const f = fixture(t);
  const document = f.record({ id: 12, cod: 'CL00003', status: 'ACTIVE', id_product: 1,
    quantity_product: 6, id_sucursal: 2, id_storage: 3, detailsClassified: [{ id_product: 4, quantity: 6 }] });
  t.mock.method(db.Classified, 'findOne', async () => document);
  await classifications.destroyClassified({ userAuth: f.actor, params: { id_classified: 12 } }, f.res);
  assert.equal(f.res.code, 201);
  assert.equal(document.status, 'INACTIVE');
  assert.deepEqual(f.stocks.map(({ stock }) => stock), [26, 4]);
  assert.equal(f.writes[0].action, 'DELETE');
  assert.equal(f.writes.at(-1), 'commit');
  assert.equal(f.movements.mock.callCount(), 0);
});

test('anulación con material consumido rechaza y solicita rollback sin confirmar historial', async (t) => {
  const f = fixture(t);
  f.stocks[1].stock = 2;
  t.mock.method(db.Classified, 'findOne', async () => f.record({ id: 12, cod: 'CL00003',
    id_product: 1, quantity_product: 6, id_sucursal: 2, id_storage: 3,
    detailsClassified: [{ id_product: 4, quantity: 6 }] }));
  await classifications.destroyClassified({ userAuth: f.actor, params: { id_classified: 12 } }, f.res);
  assert.equal(f.res.code, 422);
  assert.match(f.res.body.errors[0].msg, /No se puede anular/);
  assert.deepEqual(f.writes, ['rollback']);
});

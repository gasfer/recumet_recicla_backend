'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../database/config');
const { getInputsPaginate } = require('../controllers/input.controller');

const responseMock = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const row = (overrides = {}) => {
  const detailsInput = [{ quantity: 15, product: { name: 'Material', unit: { siglas: 'KGR' } } }];
  return {
    detailsInput,
    dataValues: {
      id: 1,
      cod: 'COMP00001',
      date_voucher: new Date('2026-09-01T10:00:00'),
      type_registry: 'BOLETA',
      registry_number: '100',
      type: 'CONTADO',
      total: 200,
      referral_sources: '',
      old_customer: false,
      with_pickup: false,
      provider: { full_names: 'Proveedor A', type: { name: 'MAYORISTA' } },
      ...overrides,
    },
  };
};

test('el listado operativo pagina en servidor y respeta el ordenamiento admitido', async (t) => {
  let receivedOptions;
  let sumWhere;
  t.mock.method(db.Input, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return { count: 1, rows: [row()] };
  });
  t.mock.method(db.Input, 'sum', async (_column, { where }) => { sumWhere = where; return 200; });
  t.mock.method(db.DetailsInput, 'sum', async () => 15);

  const res = responseMock();
  await getInputsPaginate({
    query: {
      page: '2', limit: '25', id_sucursal: '1,2', id_storage: '3', filterBy: 'MONTH', date1: '09',
      date2: '2026', type_pay: 'CONTADO', field_sort: 'total', order: 'ASC',
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(receivedOptions.limit, 25);
  assert.equal(receivedOptions.offset, 25);
  assert.deepEqual(receivedOptions.order, [['total', 'ASC']]);
  assert.equal(res.body.inputs.data[0].dataValues.total_quantity, 15);
  assert.deepEqual(res.body.inputs.totals, { totalInput: 200, totalQuantity: 15 });
  assert.ok(sumWhere[Symbol.for('and')].some(filter => filter.id_sucursal?.[Symbol.for('in')]?.includes(1)));
});

test('el listado operativo aplica el orden seguro predeterminado ante valores no admitidos', async (t) => {
  let receivedOptions;
  t.mock.method(db.Input, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return { count: 0, rows: [] };
  });
  t.mock.method(db.Input, 'sum', async () => 0);
  t.mock.method(db.DetailsInput, 'sum', async () => 0);

  await getInputsPaginate({
    query: { page: '1', limit: '50', filterBy: 'YEAR', date1: '2026', date2: '2026', field_sort: 'total; DROP', order: 'invalid' },
  }, responseMock());

  assert.deepEqual(receivedOptions.order, [['date_voucher', 'DESC']]);
});

test('el listado operativo no consume filtros exclusivos del Reporte de compras', async (t) => {
  let receivedOptions;
  t.mock.method(db.Input, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return { count: 0, rows: [] };
  });
  t.mock.method(db.Input, 'sum', async () => 0);
  t.mock.method(db.DetailsInput, 'sum', async () => 0);

  await getInputsPaginate({
    query: {
      page: '1', limit: '50', filterBy: 'MONTH', date1: '09', date2: '2026',
      category_ids: '4,5', id_products: '6', report_filters: 'Sucursales: Casa',
    },
  }, responseMock());

  assert.equal(receivedOptions.limit, 50);
  assert.equal(receivedOptions.offset, 0);
  const whereString = JSON.stringify(receivedOptions.where);
  assert.ok(!whereString.includes('category_ids'));
  assert.ok(!whereString.includes('id_products'));
  assert.ok(!whereString.includes('report_filters'));
});
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const db = require('../database/config');
const { getKardexPaginate, normalizeKardexHistoryOrder } = require('../controllers/kardex.controller');

const responseMock = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('GET /kardex pagina en servidor, acepta producto opcional y devuelve varios productos', async (t) => {
  let receivedOptions;
  let valuedOptions;
  t.mock.method(db.ViewKardex, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return {
      count: 2,
      rows: [
        { dataValues: { id_movement: 101, id_product: 10, id_sucursal: 1, id_storage: 2, type: 'INPUT', type_movement: 'INPUT', detail: 'Proveedor' } },
        { dataValues: { id_movement: 102, id_product: 20, id_sucursal: 1, id_storage: 2, type: 'OUTPUT', type_movement: 'OUTPUT', detail: 'Cliente' } },
      ],
    };
  });
  t.mock.method(db.ValuedKardexEntry, 'findAll', async (options) => { valuedOptions = options; return []; });
  t.mock.method(db.Input, 'findAll', async () => []);
  t.mock.method(db.Output, 'findAll', async () => []);

  const req = { query: { page: '1', limit: '50', id_sucursal: '1', id_storage: '2', filterBy: 'RANGE', date1: '01-01-2026', date2: '31-12-2026', field_sort: 'date', order: 'DESC' } };
  const res = responseMock();
  await getKardexPaginate(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.kardexes.data.map((row) => row.dataValues.id_product), [10, 20]);
  assert.equal(res.body.kardexes.data[0].dataValues.event_label, 'COMPRA / INGRESO');
  assert.equal(res.body.kardexes.data[1].dataValues.event_label, 'VENTA / SALIDA');
  assert.equal(receivedOptions.limit, 50);
  assert.equal(receivedOptions.offset, 0);
  assert.deepEqual(receivedOptions.order, [['date', 'DESC'], ['id', 'DESC']], 'El orden remoto debe incluir un desempate estable por id.');
  assert.ok(receivedOptions.attributes.includes('id_product'));
  assert.deepEqual(valuedOptions.where.source_id[Op.in], ['101', '102'], 'La valoración debe consultar únicamente los movimientos de la página.');
});

test('GET /kardex aplica id_product cuando se solicita', async (t) => {
  let receivedOptions;
  t.mock.method(db.ViewKardex, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return { count: 0, rows: [] };
  });
  const req = { query: { page: '1', limit: '10', id_product: '77', filterBy: 'YEAR', date1: '2026', date2: '2026', field_sort: 'date', order: 'DESC' } };
  const res = responseMock();
  await getKardexPaginate(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(receivedOptions.where[Op.and].some((filter) => filter.id_product === '77'));
});

test('GET /kardex valida el contrato field_sort y order', () => {
  assert.deepEqual(normalizeKardexHistoryOrder('product.category.name', 'desc'), ['date', 'DESC']);
  assert.deepEqual(normalizeKardexHistoryOrder('product.cod', 'ASC'), ['product', 'cod', 'ASC']);
  assert.deepEqual(normalizeKardexHistoryOrder('date', 'invalid'), ['date', 'DESC']);
});

test('GET /kardex aplica el orden ascendente solicitado por el cliente', async (t) => {
  let receivedOptions;
  t.mock.method(db.ViewKardex, 'findAndCountAll', async (options) => {
    receivedOptions = options;
    return { count: 0, rows: [] };
  });

  await getKardexPaginate({ query: { page: '1', limit: '50', filterBy: 'YEAR', date1: '2026', date2: '2026', field_sort: 'date', order: 'ASC' } }, responseMock());

  assert.deepEqual(receivedOptions.order, [['date', 'ASC'], ['id', 'ASC']]);
});

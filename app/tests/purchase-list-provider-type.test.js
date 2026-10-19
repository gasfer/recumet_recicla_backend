'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/config');
const { getInputsPaginate } = require('../controllers/input.controller');

test('la lista y sus totales aplican el tipo de proveedor y devuelven su código', async t => {
  let listCalls = 0, totalCalls = 0;
  t.mock.method(db.Input, 'findAndCountAll', async options => {
    const provider = options.include.find(item => item.association === 'provider');
    assert.equal(provider.required, true);
    assert.equal(provider.where.id_type_provider, '4');
    assert.ok(provider.include[0].attributes.includes('code'));
    listCalls++;
    return { count: 0, rows: [] };
  });
  t.mock.method(db.Input, 'findAll', async options => {
    const provider = options.include.find(item => item.association === 'provider');
    assert.equal(provider.required, true);
    assert.equal(provider.where.id_type_provider, '4');
    totalCalls++;
    return [];
  });
  const res = { status(code) { assert.equal(code, 200); return this; }, json(body) { assert.equal(body.ok, true); } };
  await getInputsPaginate({ query: { page: '1', limit: '50', filterBy: 'MONTH', date1: '10', date2: '2026', id_type_provider: '4', id_sucursal: '1', id_storage: '2' } }, res);
  assert.equal(listCalls, 1);
  assert.equal(totalCalls, 1);
});

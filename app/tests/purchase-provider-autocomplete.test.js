'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/provider.service');
const { getPurchaseProviderAutocomplete } = require('../controllers/provider.controller');

test('purchase autocomplete passes the active branch and authenticated user to availability filtering', async t => {
  const user = { role: 'OPERADOR' };
  const find = t.mock.method(service, 'findAvailableProvidersForPurchase', async (query, branch, actor) => {
    assert.equal(query, 'ACERO'); assert.equal(branch, '8'); assert.equal(actor, user);
    return [{ id: 1 }];
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };

  await getPurchaseProviderAutocomplete({ query: { query: 'ACERO', id_sucursal: '8' }, userAuth: user }, res);

  assert.equal(find.mock.callCount(), 1);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.providers, [{ id: 1 }]);
});

test('purchase autocomplete returns a branch authorization error to the caller', async t => {
  t.mock.method(service, 'findAvailableProvidersForPurchase', async () => {
    throw Object.assign(new Error('No tiene acceso a la sucursal seleccionada'), { statusCode: 403 });
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };

  await getPurchaseProviderAutocomplete({ query: { query: 'ACERO', id_sucursal: '1' }, userAuth: {} }, res);

  assert.equal(res.code, 403);
  assert.match(res.body.errors[0].msg, /acceso/);
});

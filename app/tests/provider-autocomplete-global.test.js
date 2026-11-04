'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'postgres';
const db = require('../database/config');
const providerService = require('../services/provider.service');
const { getProviderAutocomplete } = require('../controllers/provider.controller');

test('el autocompletado de proveedores no limita por sucursal', async t => {
  const providers = [{ id: 1, full_names: 'PROVEEDOR' }];
  const findAll = t.mock.method(db.Provider, 'findAll', async () => providers);
  const result = await providerService.findAutocompleteProviders('proveedor');
  assert.equal(result, providers);
  const where = findAll.mock.calls[0].arguments[0].where;
  assert.equal(where.status, true);
  assert.equal(where.id_sucursal, undefined);
  assert.equal(where.enabled_sucursal_ids, undefined);
});

test('la ruta de autocompletado ignora cualquier id_sucursal recibido', async t => {
  const find = t.mock.method(providerService, 'findAutocompleteProviders', async query => {
    assert.equal(query, 'texto');
    return [];
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await getProviderAutocomplete({ query: { query: 'texto', id_sucursal: '99' } }, res);
  assert.equal(res.code, 200);
  assert.equal(find.mock.calls.length, 1);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const db = require('../database/config');
const { purchaseProviderCatalog } = require('../controllers/purchase-provider-catalog.controller');

test('catálogo limita opciones y busca nombre/documento junto al tipo seleccionado', async t => {
  t.mock.method(db.Provider, 'findAll', async options => {
    assert.equal(options.limit, 100);
    assert.equal(options.where.id_sucursal, 3);
    assert.equal(options.where.id_type_provider, 2);
    assert.equal(options.where[Op.or][0].full_names[Op.iLike], '%ANA%');
    assert.equal(options.where[Op.or][1].number_document[Op.iLike], '%ANA%');
    return [{ id: 50, full_names: 'ANA' }];
  });
  t.mock.method(db.TypesProvider, 'findAll', async () => [{ id: 2, name: 'Empresa' }]);
  let result;
  await purchaseProviderCatalog({ userAuth: { role: 'ADMINISTRADOR' }, query: { id_sucursal: '3', id_type_provider: '2', query: ' ANA ' } }, { json(value) { result = value; } });
  assert.equal(result.ok, true);
  assert.equal(result.providers[0].id, 50);
  assert.equal(result.types[0].id, 2);
});

test('catálogo rechaza tipos inválidos antes de consultar', async t => {
  const query = t.mock.method(db.Provider, 'findAll');
  let status;
  await purchaseProviderCatalog({ query: { id_type_provider: 'abc' } }, { status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 400);
  assert.equal(query.mock.callCount(), 0);
});

test('sin sucursal no consulta proveedores globales', async t => {
  const query = t.mock.method(db.Provider, 'findAll');
  let status;
  await purchaseProviderCatalog({ userAuth: { role: 'ADMINISTRADOR' }, query: {} }, { status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 400);
  assert.equal(query.mock.callCount(), 0);
});

test('rechaza búsquedas en sucursales fuera de los permisos', async t => {
  const query = t.mock.method(db.Provider, 'findAll');
  let status;
  await purchaseProviderCatalog({ userAuth: { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }] }, query: { id_sucursal: '3', query: 'ANA' } }, { status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 403);
  assert.equal(query.mock.callCount(), 0);
});

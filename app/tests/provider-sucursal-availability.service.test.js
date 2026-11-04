'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const db = require('../database/config');
const availability = require('../services/provider-sucursal-availability.service');

test('purchase search filters by active provider-to-branch relation, not provider origin', async t => {
  t.mock.method(db.Sucursal, 'findByPk', async id => ({ id, status: true }));
  const relationSearch = t.mock.method(db.ProviderSucursalAvailability, 'findAll', async () => [{ id_provider: 22 }]);
  const providerSearch = t.mock.method(db.Provider, 'findAll', async () => []);

  await availability.findAvailableProviders('ana', 8, {
    role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }],
  });

  assert.deepEqual(relationSearch.mock.calls[0].arguments[0].where, { id_sucursal: 8, status: true });
  const options = providerSearch.mock.calls[0].arguments[0];
  assert.equal(options.where.id_sucursal, undefined);
  assert.deepEqual(options.where.id[Op.in], [22]);
  assert.equal(options.where[Op.or][0].full_names[Op.iLike], '%ana%');
});

test('purchase search rejects a branch outside the authenticated user assignments', async t => {
  t.mock.method(db.Sucursal, 'findByPk', async id => ({ id, status: true }));
  const relationSearch = t.mock.method(db.ProviderSucursalAvailability, 'findAll');
  await assert.rejects(() => availability.findAvailableProviders('', 1, {
    role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }],
  }), { statusCode: 403 });
  assert.equal(relationSearch.mock.callCount(), 0);
});

test('commercial availability updates preserve active branches outside the user scope', async t => {
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 8 }]);
  const disabledUpdates = [];
  t.mock.method(db.ProviderSucursalAvailability, 'findAll', async () => [
    { id_sucursal: 8, status: true, update: async values => disabledUpdates.push({ branch: 8, values }) },
    { id_sucursal: 1, status: true, update: async values => disabledUpdates.push({ branch: 1, values }) },
  ]);

  await availability.syncAuthorized(22, [], {
    role: 'COMERCIAL', assign_sucursales: [{ id_sucursal: 8 }],
  });

  assert.deepEqual(disabledUpdates, [{ branch: 8, values: { status: false } }]);
});

test('commercial cannot enable an unassigned branch', async t => {
  t.mock.method(db.Sucursal, 'findAll', async () => [{ id: 8 }]);
  t.mock.method(db.ProviderSucursalAvailability, 'findAll', async () => []);
  await assert.rejects(() => availability.syncAuthorized(22, [1], {
    role: 'COMERCIAL', assign_sucursales: [{ id_sucursal: 8 }],
  }), { statusCode: 403 });
});

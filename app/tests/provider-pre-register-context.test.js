'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Sucursal, Provider, sequelize } = require('../database/config');
const service = require('../services/provider.service');

test('preregistro usa la sucursal seleccionada y su ciudad, incluso para administradores sin asignaciones', async (t) => {
  const transaction = {};
  let saved;
  t.mock.method(sequelize, 'transaction', async (callback) => callback(transaction));
  t.mock.method(Sucursal, 'findByPk', async (id) => ({ id, city: 'Santa Cruz', status: true }));
  t.mock.method(Provider, 'create', async (data) => { saved = data; return { id: 100, ...data }; });
  t.mock.method(service, 'syncMainBranch', async (provider, location, tx) => {
    assert.equal(provider.id_sucursal, 2);
    assert.deepEqual(location, { city: 'Santa Cruz' });
    assert.equal(tx, transaction);
  });
  t.mock.method(service, 'getProviderDetails', async (id, tx) => {
    assert.equal(id, 100);
    assert.equal(tx, transaction);
    return { id };
  });
  await service.preRegisterProvider({ full_names: 'Proveedor' }, 2, {
    role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }, { id_sucursal: 2 }],
  });
  assert.equal(saved.id_sucursal, 2);
  await service.preRegisterProvider({ full_names: 'Proveedor' }, 2, { role: 'ADMINISTRADOR', assign_sucursales: [] });
});

test('rechaza selección ausente, no autorizada o inactiva antes de crear al proveedor', async (t) => {
  const create = t.mock.method(Provider, 'create', async () => assert.fail('No debe crear un proveedor'));
  await assert.rejects(service.preRegisterProvider({}, 0, { role: 'ADMINISTRADOR' }), { statusCode: 400 });
  await assert.rejects(service.preRegisterProvider({}, 2, {
    role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }],
  }), { statusCode: 403 });
  t.mock.method(sequelize, 'transaction', async (callback) => callback({}));
  t.mock.method(Sucursal, 'findByPk', async () => ({ id: 2, status: false }));
  await assert.rejects(service.preRegisterProvider({}, 2, { role: 'ADMINISTRADOR' }), { statusCode: 400 });
  assert.equal(create.mock.callCount(), 0);
});

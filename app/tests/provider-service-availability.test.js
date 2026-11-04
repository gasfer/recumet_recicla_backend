'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Provider, Sucursal, sequelize } = require('../database/config');
const service = require('../services/provider.service');
const availability = require('../services/provider-sucursal-availability.service');

const suppressProfileWork = (t) => {
  for (const name of ['validateProfile', 'syncMainBranch', 'syncMainContact', 'syncMainMaterial', 'syncMainBankAccount', 'syncDetails']) {
    t.mock.method(service, name, async () => {});
  }
};

test('creating a full provider derives only initial branch availability from its authenticated context', async t => {
  const transaction = {};
  const user = { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }] };
  let created;
  t.mock.method(sequelize, 'transaction', async callback => callback(transaction));
  suppressProfileWork(t);
  t.mock.method(availability, 'assertBranchAccess', async (id, actor, tx) => {
    assert.equal(id, 8); assert.equal(actor, user); assert.equal(tx, transaction); return 8;
  });
  t.mock.method(availability, 'enableInitial', async (providerId, branchId, actor, tx) => {
    assert.equal(providerId, 55); assert.equal(branchId, 8); assert.equal(actor, user); assert.equal(tx, transaction);
  });
  t.mock.method(Provider, 'create', async data => { created = data; return { id: 55 }; });
  t.mock.method(service, 'getProviderDetails', async () => ({ id: 55 }));

  await service.createProfile({ id_sucursal: 8, enabled_sucursal_ids: [1, 8], full_names: 'PROVEEDOR' }, user);

  assert.equal(created.id_sucursal, 8);
  assert.equal(Object.hasOwn(created, 'enabled_sucursal_ids'), false);
});

test('pre-registration returns an existing provider instead of creating a duplicate identity', async t => {
  const existing = { id: 3066, full_names: 'PROVEEDOR EXISTENTE' };
  t.mock.method(sequelize, 'transaction', async callback => callback({}));
  t.mock.method(sequelize, 'query', async () => [[], {}]);
  t.mock.method(Sucursal, 'findByPk', async id => ({ id, status: true }));
  t.mock.method(service, 'findDuplicate', async () => existing);
  const create = t.mock.method(Provider, 'create', async () => assert.fail('No debe crear otro proveedor'));

  await assert.rejects(service.preRegisterProvider({ number_document: '1234' }, 8, {
    role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }],
  }), error => error.statusCode === 409 && error.duplicateProvider === existing);
  assert.equal(create.mock.callCount(), 0);
});

test('editing availability does not change provider registration branch', async t => {
  let saved;
  const provider = { id: 22, id_sucursal: 8, update: async data => { saved = data; } };
  t.mock.method(sequelize, 'transaction', async callback => callback({}));
  suppressProfileWork(t);
  t.mock.method(service, 'requireProvider', async () => provider);
  t.mock.method(service, 'getProviderDetails', async () => provider);

  await service.updateProfile(22, { id_sucursal: 1, full_names: 'ACTUALIZADO' }, {
    role: 'ADMINISTRADOR', assign_sucursales: [],
  });

  assert.equal(provider.id_sucursal, 8);
  assert.equal(Object.hasOwn(saved, 'id_sucursal'), false);
});

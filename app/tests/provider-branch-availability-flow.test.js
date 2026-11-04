'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Provider, ProviderSucursalAvailability, Sucursal, sequelize } = require('../database/config');
const providerService = require('../services/provider.service');
const availability = require('../services/provider-sucursal-availability.service');

test('one provider moves through local registration, authorized sharing and branch-only disablement', async t => {
  const relations = new Map();
  const keyFor = (providerId, branchId) => `${providerId}:${branchId}`;
  const rowFor = (providerId, branchId) => relations.get(keyFor(providerId, branchId));
  const user = { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }] };
  const admin = { role: 'ADMINISTRADOR', assign_sucursales: [] };

  t.mock.method(sequelize, 'transaction', async callback => callback({}));
  t.mock.method(sequelize, 'query', async () => [[], {}]);
  t.mock.method(Sucursal, 'findByPk', async id => [1, 8].includes(Number(id)) ? { id: Number(id), status: true } : null);
  t.mock.method(Sucursal, 'findAll', async () => [{ id: 1 }, { id: 8 }]);
  t.mock.method(providerService, 'findDuplicate', async () => null);
  t.mock.method(providerService, 'syncMainBranch', async () => {});
  t.mock.method(providerService, 'getProviderDetails', async id => ({ id }));
  t.mock.method(Provider, 'create', async data => ({ id: 500, ...data }));
  t.mock.method(Provider, 'findAll', async options => options.where.id[Op.in].includes(500) ? [{ id: 500, full_names: 'PROVEEDOR COMPARTIDO', status: true }] : []);
  t.mock.method(ProviderSucursalAvailability, 'findOne', async ({ where }) => {
    const row = rowFor(Number(where.id_provider), Number(where.id_sucursal));
    return row && (where.status === undefined || row.status === where.status) ? row : null;
  });
  t.mock.method(ProviderSucursalAvailability, 'findAll', async ({ where }) => {
    const rows = [...relations.values()].filter(row => {
      if (where.id_provider !== undefined && row.id_provider !== where.id_provider) return false;
      if (where.id_sucursal?.[Op.in] && !where.id_sucursal[Op.in].includes(row.id_sucursal)) return false;
      if (where.id_sucursal !== undefined && typeof where.id_sucursal === 'number' && row.id_sucursal !== where.id_sucursal) return false;
      if (where.status !== undefined && row.status !== where.status) return false;
      return true;
    });
    return rows;
  });
  t.mock.method(ProviderSucursalAvailability, 'create', async data => {
    const row = { ...data, async update(values) { Object.assign(this, values); } };
    relations.set(keyFor(data.id_provider, data.id_sucursal), row);
    return row;
  });

  await providerService.preRegisterProvider({ full_names: 'PROVEEDOR COMPARTIDO' }, 8, user);
  assert.equal(await availability.isEnabled(500, 8), true);
  assert.equal(await availability.isEnabled(500, 1), false);
  assert.deepEqual(await availability.findAvailableProviders('PROVEEDOR', 8, user), [{ id: 500, full_names: 'PROVEEDOR COMPARTIDO', status: true }]);

  await assert.rejects(() => availability.findAvailableProviders('PROVEEDOR', 1, user), { statusCode: 403 });
  await availability.syncAuthorized(500, [1, 8], admin);
  assert.equal(await availability.isEnabled(500, 1), true);
  assert.deepEqual(await availability.findAvailableProviders('PROVEEDOR', 1, admin), [{ id: 500, full_names: 'PROVEEDOR COMPARTIDO', status: true }]);

  await availability.syncAuthorized(500, [1], admin);
  assert.equal(await availability.isEnabled(500, 8), false);
  assert.equal(await availability.isEnabled(500, 1), true);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260915190000-create-valued-kardex-ledger');
const { ValuedInventoryRepository, locationWhere } = require('../repositories/valued-inventory.repository');
const { MissingCostBasisError, ValuedBalanceDiscontinuityError } = require('../errors/valued-kardex.error');

const migrationInterface = () => {
  const calls = [];
  const queryInterface = {
    sequelize: { transaction: async (callback) => callback({ id: 'tx' }) },
    createTable: async (...args) => calls.push(['createTable', ...args]),
    addConstraint: async (...args) => calls.push(['addConstraint', ...args]),
    addIndex: async (...args) => calls.push(['addIndex', ...args]),
    dropTable: async (...args) => calls.push(['dropTable', ...args]),
  };
  return { calls, queryInterface };
};

test('la migración crea el saldo y libro valorado con índices, y el rollback sólo retira sus tablas', async () => {
  const mock = migrationInterface();
  await migration.up(mock.queryInterface);
  assert.deepEqual(mock.calls.filter(([name]) => name === 'createTable').map(([, table]) => table), [
    'valued_inventory_balances', 'valued_kardex_entries',
  ]);
  assert.ok(mock.calls.some(([name, , , options]) => name === 'addIndex' && options.name === migration.BALANCE_LOCATION_INDEX));
  await migration.down(mock.queryInterface);
  assert.deepEqual(mock.calls.filter(([name]) => name === 'dropTable').map(([, table]) => table), [
    'valued_kardex_entries', 'valued_inventory_balances',
  ]);
});

test('el repositorio bloquea el saldo de la ubicación antes de devolverlo', async () => {
  const calls = [];
  const row = { id: 1 };
  const models = {
    ValuedInventoryBalance: {
      findOne: async (options) => { calls.push(options); return row; },
      create: async () => { throw new Error('no debe crear'); },
    },
    ValuedKardexEntry: {},
  };
  const repository = new ValuedInventoryRepository(models);
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  assert.equal(await repository.lockBalance({ id_product: 1, id_sucursal: 2, id_storage: 3 }, transaction), row);
  assert.equal(calls[0].lock, 'UPDATE');
  assert.deepEqual(calls[0].where, { id_product: 1, id_sucursal: 2, id_storage: 3 });
});

test('los errores de dominio exponen sólo identificadores de ubicación', () => {
  const location = { id_product: 4, id_sucursal: 5, id_storage: 6, secret: 'no' };
  const missing = new MissingCostBasisError(location);
  const discontinuity = new ValuedBalanceDiscontinuityError(location);
  assert.equal(missing.code, 'VALUED_KARDEX_COST_BASIS_MISSING');
  assert.equal(discontinuity.code, 'VALUED_KARDEX_BALANCE_DISCONTINUITY');
  assert.deepEqual(missing.location, { id_product: 4, id_sucursal: 5, id_storage: 6 });
  assert.deepEqual(locationWhere(location), { id_product: 4, id_sucursal: 5, id_storage: 6 });
});

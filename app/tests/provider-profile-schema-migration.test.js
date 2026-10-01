'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20260930110000-complete-provider-company-sites');

const Sequelize = {
  INTEGER: 'INTEGER',
  ENUM: (...values) => ({ type: 'ENUM', values }),
};

function createQueryInterface() {
  const calls = [];
  return {
    calls,
    sequelize: { query: async (...args) => calls.push(['query', ...args]) },
    addColumn: async (...args) => calls.push(['addColumn', ...args]),
    removeColumn: async (...args) => calls.push(['removeColumn', ...args]),
    addIndex: async (...args) => calls.push(['addIndex', ...args]),
    removeIndex: async (...args) => calls.push(['removeIndex', ...args]),
  };
}

test('provider profile migration adds site role, commercial owner and partial unique indexes', async () => {
  const queryInterface = createQueryInterface();
  await migration.up(queryInterface, Sequelize);

  const siteRole = queryInterface.calls.find((call) => call[0] === 'addColumn' && call[1] === 'providers');
  assert.deepEqual(siteRole[3].type.values, ['HEADQUARTERS', 'BRANCH']);
  assert.ok(queryInterface.calls.some((call) => call[0] === 'addColumn' && call[1] === 'provider_companies' && call[2] === 'id_commercial_user'));

  const uniqueIndexes = queryInterface.calls.filter((call) => call[0] === 'addIndex').map((call) => call[3]);
  assert.equal(uniqueIndexes.length, 7);
  assert.ok(uniqueIndexes.every((options) => options.unique === true));
  assert.ok(uniqueIndexes.some((options) => options.where.site_role === 'HEADQUARTERS' && options.where.status === true));
  assert.ok(uniqueIndexes.some((options) => options.where.is_main_contact === true));
  assert.ok(uniqueIndexes.some((options) => options.where.is_main === true));
});

test('provider profile migration down removes indexes, columns and enum type', async () => {
  const queryInterface = createQueryInterface();
  await migration.down(queryInterface);
  assert.equal(queryInterface.calls.filter((call) => call[0] === 'removeIndex').length, 7);
  assert.ok(queryInterface.calls.some((call) => call[0] === 'removeColumn' && call[1] === 'providers' && call[2] === 'site_role'));
  assert.ok(queryInterface.calls.some((call) => call[0] === 'query' && call[1].includes('enum_providers_site_role')));
});

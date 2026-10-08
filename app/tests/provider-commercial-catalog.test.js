const test = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDER_COMMERCIAL_CATALOGS, isProviderCatalogValue } = require('../constants/provider-commercial.constants');

test('catálogos comerciales aceptan únicamente los valores definidos', () => {
  assert.equal(isProviderCatalogValue('frequency', 'WEEKLY'), true);
  assert.equal(isProviderCatalogValue('frequency', 'INVALID'), false);
  assert.equal(isProviderCatalogValue('site_role', 'HEADQUARTERS'), true);
  assert.equal(isProviderCatalogValue('site_role', 'MATRIX'), false);
  assert.deepEqual(PROVIDER_COMMERCIAL_CATALOGS.currency, ['BOB', 'USD']);
});

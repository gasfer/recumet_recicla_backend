'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
test('el borrador recupera campos incompletos, se aísla por usuario y se elimina al finalizar', { skip: process.env.RECUMET_PROVIDER_DB_TEST !== '1' }, async () => {
  const { sequelize } = require('../database/config');
  const drafts = require('../controllers/provider-draft.controller');
  sequelize.options.logging = false;
  const transaction = await sequelize.transaction();
  const originalQuery = sequelize.query;
  sequelize.query = function(sql, options) { return originalQuery.call(this, sql, { ...options, transaction }); };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const req = { params: { key: 'provider-999999' }, userAuth: { id: 987654321 }, body: { values: { full_names: 'AVANCE', department: '', contacts: [{ full_name: 'ANA', cellphone: '63909240' }], bankAccounts: [{ account_number: '000123' }] } } };
  try {
    let res = response(); await drafts.save(req, res); assert.equal(res.code, 200);
    res = response(); await drafts.read(req, res); assert.deepEqual(res.body.draft.values, req.body.values);
    res = response(); await drafts.read({ ...req, userAuth: { id: 987654322 } }, res); assert.equal(res.body.draft, null);
    res = response(); await drafts.remove(req, res); assert.equal(res.body.ok, true);
    res = response(); await drafts.read(req, res); assert.equal(res.body.draft, null);
  } finally { sequelize.query = originalQuery; await transaction.rollback(); await sequelize.close(); }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const { Op } = require('sequelize');
const db = require('../database/config');
const { classifiedMaterialFilter } = require('../services/classified-material-filter');

test('categorías y productos admiten selección múltiple por separado y se intersectan al combinarse', () => {
  assert.deepEqual(classifiedMaterialFilter({}), []);
  assert.deepEqual(classifiedMaterialFilter({ product_ids: '1,2,1' })[0].id_product[Op.in], [1, 2]);
  assert.match(classifiedMaterialFilter({ category_ids: '3,4' })[0].id_product[Op.in].val, /id_category IN \(3,4\)/);
  assert.equal(classifiedMaterialFilter({ product_ids: '1,2', category_ids: '3,4' }).length, 2);
  assert.deepEqual(classifiedMaterialFilter({ id_product: '5' })[0].id_product[Op.in], [5]);
  assert.deepEqual(classifiedMaterialFilter({ category_ids: '1); DROP TABLE products;--' }), []);
});

test('la lista y ambos Excel usan el mismo filtro de material de origen', async t => {
  t.mock.method(require('../helpers/company'), 'getNumberDecimal', async () => 2);
  t.mock.method(db.Sucursal, 'findByPk', async () => ({ name: 'Casa Matriz', city: 'Cochabamba', company: { nit: '123' } }));
  const list = require('../controllers/classified.controller');
  const reports = require('../controllers/reports/classified.controller');
  for (const filters of [{ category_ids: '3,4' }, { product_ids: '1,2' }, { category_ids: '3,4', product_ids: '1,2' }]) {
    t.mock.method(db.Category, 'findAll', async () => [{ name: 'Metales' }]);
    t.mock.method(db.Product, 'findAll', async () => [{ name: 'Aluminio' }]);
    const inspect = where => {
      const conditions = where[Op.and].filter(condition => condition.id_product);
      assert.equal(conditions.length, Object.keys(filters).length);
      if (filters.product_ids) assert.ok(conditions.some(c => Array.isArray(c.id_product[Op.in]) && c.id_product[Op.in].join(',') === '1,2'));
      if (filters.category_ids) assert.ok(conditions.some(c => c.id_product[Op.in].val?.includes('id_category IN (3,4)')));
    };
    t.mock.method(db.Classified, 'findAndCountAll', async options => { inspect(options.where); return { count: 0, rows: [] }; });
    t.mock.method(db.Classified, 'findAll', async options => { inspect(options.where); return []; });
    t.mock.method(db.DetailsClassified, 'findAll', async options => { inspect(options.include.find(i => i.association === 'classified').where); return []; });
    const req = { query: { filterBy: 'MONTH', date1: '10', date2: '2026', id_sucursal: '1', status: 'ACTIVE', orderNew: ['id', 'DESC'], ...filters } };
    await list.getClassifiedsPaginate(req, { status(code) { assert.equal(code, 200); return this; }, json(body) { assert.equal(body.ok, true); } });
    for (const handler of ['generateExcelReports', 'generateExcelDetailsReports']) {
      const res = new PassThrough(); res.resume(); res.setHeader = () => {};
      res.status = code => { assert.fail('HTTP ' + code); };
      const finished = once(res, 'finish');
      await reports[handler](req, res);
      await finished;
    }
  }
});

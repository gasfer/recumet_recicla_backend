const test = require('node:test');
const assert = require('node:assert/strict');

const configPath = require.resolve('../database/config');
const paginatePath = require.resolve('../helpers/paginate');
const servicePath = require.resolve('../services/product-category-access.service');
const productControllerPath = require.resolve('../controllers/product.controller');
const categoryControllerPath = require.resolve('../controllers/category.controller');

const originalModules = new Map([
  [configPath, require.cache[configPath]],
  [paginatePath, require.cache[paginatePath]],
  [servicePath, require.cache[servicePath]],
  [productControllerPath, require.cache[productControllerPath]],
  [categoryControllerPath, require.cache[categoryControllerPath]],
]);

test.after(() => {
  for (const [path, cachedModule] of originalModules) {
    if (cachedModule) require.cache[path] = cachedModule;
    else delete require.cache[path];
  }
});

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return body; },
});

const userAllowedOnlyRawMaterial = () => ({
  role: 'OPERADOR',
  assign_permission: [{
    module: 'COMPRAS',
    allowed_category_types: ['RAW_MATERIAL'],
    status: true,
    create: true,
    update: true,
  }],
  assign_sucursales: [],
});

const inValues = condition => condition[Reflect.ownKeys(condition)[0]];

test('el catálogo de productos intersecta filtros manipulados con los permisos', async () => {
  let capturedOptions;
  const models = {
    Product: {},
    ProductSucursals: { findAll: async () => [{ id_product: 1 }] },
    Category: { findAll: async () => { throw new Error('No debe consultar categorías fuera de la política contextual'); } },
    Price: {}, sequelize: {}, Stock: {}, ProductCosts: {}, kardexMovements: {},
  };
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: models };
  require.cache[paginatePath] = {
    id: paginatePath,
    filename: paginatePath,
    loaded: true,
    exports: async (_model, _page, _limit, _type, _query, options) => {
      capturedOptions = options;
      return { data: [] };
    },
  };
  delete require.cache[servicePath];
  delete require.cache[productControllerPath];

  const { getProductPaginate } = require('../controllers/product.controller');
  const res = createResponse();
  await getProductPaginate({
    userAuth: userAllowedOnlyRawMaterial(),
    productAccessContext: 'COMPRAS',
    query: {
      page: 1,
      limit: 50,
      status: true,
      stock: false,
      withStock: false,
      id_sucursal: 1,
      id_storage: 1,
      category_type: 'FINISHED_PRODUCT',
      orderNew: ['id', 'DESC'],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(inValues(capturedOptions.include[0].where.type), []);
});

test('el catálogo de categorías devuelve solamente tipos permitidos', async () => {
  let capturedOptions;
  const models = { Product: {}, Category: {}, sequelize: {} };
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: models };
  require.cache[paginatePath] = {
    id: paginatePath,
    filename: paginatePath,
    loaded: true,
    exports: async (_model, _page, _limit, _type, _query, options) => {
      capturedOptions = options;
      return { data: [] };
    },
  };
  delete require.cache[servicePath];
  delete require.cache[categoryControllerPath];

  const { getCategoryPaginate } = require('../controllers/category.controller');
  const res = createResponse();
  await getCategoryPaginate({
    userAuth: userAllowedOnlyRawMaterial(),
    productAccessContext: 'COMPRAS',
    query: {
      page: 1,
      limit: 50,
      status: true,
      orderNew: ['id', 'DESC'],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(inValues(capturedOptions.where.type), ['RAW_MATERIAL']);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRODUCT_CATEGORY_TYPES,
  PRODUCT_ACCESS_CONTEXTS,
} = require('../constants/product-category-access');
const {
  getAllowedCategoryTypes,
  intersectAllowedCategoryTypes,
  findUnauthorizedProducts,
} = require('../services/product-category-access.service');
const { assignPermission } = require('../database/config');

const userWithPermissions = permissions => ({
  role: 'OPERADOR',
  assign_permission: permissions.map(([module, allowed_category_types]) => ({
    module,
    allowed_category_types,
    status: true,
    create: true,
    update: true,
  })),
});

test('Administrador conserva todos los tipos en cualquier módulo soportado', () => {
  const user = { role: 'ADMINISTRADOR', assign_permission: [] };
  assert.deepEqual(
    getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES),
    PRODUCT_CATEGORY_TYPES,
  );
});

test('Encargado respeta la matriz configurada por módulo', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['RAW_MATERIAL', 'RESALE_ITEM']],
  ]);
  user.role = 'ENCARGADO';

  assert.deepEqual(
    getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES),
    ['RAW_MATERIAL', 'RESALE_ITEM'],
  );
});

test('una instancia Sequelize concede los tipos permitidos para la acción update', () => {
  const permission = assignPermission.build({
    module: PRODUCT_ACCESS_CONTEXTS.PURCHASES,
    allowed_category_types: ['RAW_MATERIAL', 'FINISHED_PRODUCT'],
    status: true,
    create: false,
    update: true,
  });

  assert.deepEqual(
    getAllowedCategoryTypes(
      { role: 'ENCARGADO', assign_permission: [permission] },
      PRODUCT_ACCESS_CONTEXTS.PURCHASES,
      ['update'],
    ),
    ['RAW_MATERIAL', 'FINISHED_PRODUCT'],
  );
});

test('los permisos de Compras y Ventas permanecen independientes', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['RAW_MATERIAL']],
    [PRODUCT_ACCESS_CONTEXTS.SALES, ['RAW_MATERIAL', 'FINISHED_PRODUCT']],
  ]);

  assert.deepEqual(getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES), ['RAW_MATERIAL']);
  assert.deepEqual(
    getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.SALES),
    ['RAW_MATERIAL', 'FINISHED_PRODUCT'],
  );
});

test('la ausencia de permiso produce una lista vacía', () => {
  assert.deepEqual(
    getAllowedCategoryTypes(userWithPermissions([]), PRODUCT_ACCESS_CONTEXTS.TRANSFERS),
    [],
  );
});

test('una colección configurada vacía no concede tipos', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.TRANSFERS, []],
  ]);
  assert.deepEqual(
    getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.TRANSFERS),
    [],
  );
});

test('los tipos asignados no conceden acceso sin una acción general del módulo', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['RAW_MATERIAL']],
  ]);
  user.assign_permission[0].create = false;
  user.assign_permission[0].update = false;
  assert.deepEqual(getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES), []);
});

test('un filtro solicitado nunca amplía los tipos autorizados', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['RAW_MATERIAL']],
  ]);
  assert.deepEqual(
    intersectAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['FINISHED_PRODUCT']),
    [],
  );
});

test('una revocación se refleja usando el permiso vigente del usuario', () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.PURCHASES, ['RAW_MATERIAL', 'FINISHED_PRODUCT']],
  ]);
  assert.equal(getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES).includes('FINISHED_PRODUCT'), true);
  user.assign_permission[0].allowed_category_types = ['RAW_MATERIAL'];
  assert.equal(getAllowedCategoryTypes(user, PRODUCT_ACCESS_CONTEXTS.PURCHASES).includes('FINISHED_PRODUCT'), false);
});

test('detecta en bloque productos inexistentes o con tipos denegados', async () => {
  const user = userWithPermissions([
    [PRODUCT_ACCESS_CONTEXTS.SALES, ['RAW_MATERIAL']],
  ]);
  const ProductModel = {
    findAll: async () => [
      { id: 1, category: { type: 'RAW_MATERIAL' } },
      { id: 2, category: { type: 'FINISHED_PRODUCT' } },
    ],
  };

  assert.deepEqual(await findUnauthorizedProducts({
    user,
    context: PRODUCT_ACCESS_CONTEXTS.SALES,
    productIds: [1, 2, 3, 2],
    action: 'create',
    ProductModel,
  }), [2, 3]);
});

test('Clasificados extrae producto origen y todos los productos resultantes', () => {
  const { classifiedProductIds } = require('../middlewares/authorize-product-category-access');
  assert.deepEqual(classifiedProductIds({
    classified_data: { id_product: 10 },
    classified_details: [{ id_product: 20 }, { id_product: 30 }],
  }), [10, 20, 30]);
});

test('el middleware rechaza cargas mixtas antes de los controladores de los cuatro módulos', async () => {
  const servicePath = require.resolve('../services/product-category-access.service');
  const middlewarePath = require.resolve('../middlewares/authorize-product-category-access');
  const originalService = require.cache[servicePath];
  const originalMiddleware = require.cache[middlewarePath];
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: { findUnauthorizedProducts: async () => [99] },
  };
  delete require.cache[middlewarePath];

  try {
    const { authorizeProductCategoryAccess } = require('../middlewares/authorize-product-category-access');
    let nextCalled = false;
    let responseStatus;
    let responseBody;
    for (const context of Object.values(PRODUCT_ACCESS_CONTEXTS)) {
      nextCalled = false;
      responseStatus = undefined;
      responseBody = undefined;
      const middleware = authorizeProductCategoryAccess({
        context,
        action: 'create',
        extractProductIds: () => [1, 99],
      });
      await middleware(
        { userAuth: userWithPermissions([[context, ['RAW_MATERIAL']]]), body: {} },
        {
          status(code) { responseStatus = code; return this; },
          json(body) { responseBody = body; return body; },
        },
        () => { nextCalled = true; },
      );

      assert.equal(responseStatus, 403);
      assert.equal(nextCalled, false);
      assert.deepEqual(responseBody.errors[0].product_ids, [99]);
    }
  } finally {
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
    if (originalMiddleware) require.cache[middlewarePath] = originalMiddleware;
    else delete require.cache[middlewarePath];
  }
});

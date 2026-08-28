const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRODUCT_ACCESS_ROUTE_CONTEXTS,
} = require('../constants/product-category-access');
const {
  bindProductAccessContext,
} = require('../middlewares/bind-product-access-context');
const {
  authorizeModulePermission,
} = require('../middlewares/authorize-module-permission');

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return body; },
});

test('la ruta operativa enlaza su contexto aunque el cliente no envíe parámetros', () => {
  const req = { query: {} };
  let nextCalled = false;
  bindProductAccessContext('COMPRAS')(req, createResponse(), () => {
    nextCalled = true;
  });

  assert.equal(req.productAccessContext, 'COMPRAS');
  assert.equal(nextCalled, true);
});

test('la ruta operativa rechaza cualquier contexto legado manipulable', () => {
  for (const product_context of ['COMPRAS', 'VENTAS']) {
    const req = { query: { product_context } };
    const res = createResponse();
    let nextCalled = false;
    bindProductAccessContext('COMPRAS')(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
  }
});

test('el catálogo general exige el permiso de vista y mantiene bypass de Administrador', () => {
  const middleware = authorizeModulePermission('PRODUCTOS', 'view');

  for (const user of [
    { role: 'OPERADOR', assign_permission: [] },
    { role: 'OPERADOR', assign_permission: [{ module: 'PRODUCTOS', view: false }] },
  ]) {
    const res = createResponse();
    let nextCalled = false;
    middleware({ userAuth: user }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  }

  for (const user of [
    { role: 'OPERADOR', assign_permission: [{ module: 'PRODUCTOS', view: true }] },
    { role: 'ADMINISTRADOR', assign_permission: [] },
  ]) {
    let nextCalled = false;
    middleware({ userAuth: user }, createResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
});

test('productos y categorías registran los cuatro contextos como rutas fijas', () => {
  const productRouter = require('../routes/product');
  const categoryRouter = require('../routes/category');

  for (const [segment, context] of Object.entries(PRODUCT_ACCESS_ROUTE_CONTEXTS)) {
    for (const router of [productRouter, categoryRouter]) {
      for (const suffix of ['', '/select']) {
        const routePath = `/operational/${segment}${suffix}`;
        const route = router.stack.find(layer => layer.route?.path === routePath)?.route;
        assert.ok(route, `Falta registrar ${routePath}`);
        assert.equal(
          route.stack.some(layer => layer.handle.productAccessContext === context),
          true,
        );
      }
    }
  }
});

test('los catálogos generales registran permisos administrativos separados', () => {
  const productRouter = require('../routes/product');
  const categoryRouter = require('../routes/category');
  const expected = [
    [productRouter, '/', 'PRODUCTOS'],
    [productRouter, '/select', 'PRODUCTOS'],
    [categoryRouter, '/', 'CATEGORIAS'],
    [categoryRouter, '/select', 'CATEGORIAS'],
  ];

  for (const [router, path, module] of expected) {
    const route = router.stack.find(layer => layer.route?.path === path)?.route;
    assert.ok(route, `Falta registrar ${path}`);
    assert.equal(
      route.stack.some(layer => layer.handle.modulePermission?.module === module),
      true,
    );
  }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const inputRouter = require('../routes/input');
const traceabilityRouter = require('../routes/purchase_traceability');
const { assignPermission } = require('../database/config');

const sequelizePermission = update => assignPermission.build({
  module: 'COMPRAS',
  status: true,
  update,
});

const findPurchaseUpdateMiddleware = (router, path) => {
  const route = router.stack.find(layer => layer.route?.path === path)?.route;
  assert.ok(route, `Falta registrar la ruta ${path}`);

  const middleware = route.stack.find(layer => (
    layer.handle.modulePermission?.module === 'COMPRAS'
    && layer.handle.modulePermission?.action === 'update'
  ))?.handle;
  assert.ok(middleware, `${path} debe conservar la protección COMPRAS.update`);
  return middleware;
};

const response = () => ({
  code: undefined,
  body: undefined,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const routes = [
  ['actualización de compras', inputRouter, '/:id_input'],
  ['consulta de responsables', traceabilityRouter, '/authorizers'],
];

for (const [name, router, path] of routes) {
  test(`${name} responde 403 sin COMPRAS.update`, () => {
    const middleware = findPurchaseUpdateMiddleware(router, path);
    const res = response();
    let nextCalled = false;

    middleware({
      userAuth: {
        role: 'OPERADOR',
        assign_permission: [sequelizePermission(false)],
      },
    }, res, () => { nextCalled = true; });

    assert.equal(res.code, 403);
    assert.equal(res.body.ok, false);
    assert.match(res.body.errors[0].msg, /modificar el módulo COMPRAS/);
    assert.equal(nextCalled, false);
  });

  test(`${name} permite superar el middleware con COMPRAS.update`, () => {
    const middleware = findPurchaseUpdateMiddleware(router, path);
    let nextCalled = false;

    middleware({
      userAuth: {
        role: 'OPERADOR',
        assign_permission: [sequelizePermission(true)],
      },
    }, response(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  test(`${name} permite superar el middleware al Administrador`, () => {
    const middleware = findPurchaseUpdateMiddleware(router, path);
    let nextCalled = false;

    middleware({
      userAuth: { role: 'ADMINISTRADOR', assign_permission: [] },
    }, response(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });
}

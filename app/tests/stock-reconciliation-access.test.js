'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeStockReconciliation } = require('../middlewares/authorize-stock-reconciliation');

const responseRecorder = () => {
  const result = {};
  return {
    result,
    response: {
      status(status) { result.status = status; return this; },
      json(body) { result.body = body; return body; },
    },
  };
};

const requestFor = (permission, idSucursal = 1) => ({
  query: { id_sucursal: idSucursal },
  body: {},
  userAuth: {
    role: 'ENCARGADO',
    assign_permission: [{ module: 'STOCK_RECONCILIATION', status: true, ...permission }],
    assign_sucursales: [{ id_sucursal: 1, status: true }],
  },
});

test('consulta, investigación, regularización y autorización usan permisos separados', () => {
  const matrix = [
    ['read', 'view'],
    ['investigate', 'create'],
    ['regularize', 'update'],
    ['authorize', 'reports'],
  ];

  for (const [action, field] of matrix) {
    let nextCalls = 0;
    authorizeStockReconciliation(action)(requestFor({ [field]: true }), responseRecorder().response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1, `${action} debe aceptar ${field}`);

    const { result, response } = responseRecorder();
    authorizeStockReconciliation(action)(requestFor({ [field]: false }), response, () => {});
    assert.equal(result.status, 403, `${action} debe rechazar sin ${field}`);
    assert.match(result.body.errors[0].msg, /conciliaciones Stock–Kardex/);
  }
});

test('un permiso global no concede acceso a otra sucursal', () => {
  const { result, response } = responseRecorder();
  authorizeStockReconciliation('read')(requestFor({ view: true }, 2), response, () => {});

  assert.equal(result.status, 403);
  assert.match(result.body.errors[0].msg, /esta sucursal/);
});

test('Administrador conserva acceso sin asignaciones explícitas', () => {
  let nextCalls = 0;
  authorizeStockReconciliation('regularize')({
    query: { id_sucursal: 99 }, body: {}, userAuth: { role: 'ADMINISTRADOR' },
  }, responseRecorder().response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
});

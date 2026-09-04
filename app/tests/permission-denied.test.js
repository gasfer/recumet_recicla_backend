'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  permissionDeniedError,
  permissionDeniedMessage,
  sendPermissionDenied,
} = require('../helpers/permission-denied');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');
const { authorizeTransferReview } = require('../middlewares/authorize-transfer-review');
const { assignPermission } = require('../database/config');

const responseRecorder = () => {
  const result = {};
  return {
    result,
    response: {
      status(status) {
        result.status = status;
        return this;
      },
      json(body) {
        result.body = body;
        return body;
      },
    },
  };
};

test('construye una denegación 403 compatible y orientada a soporte', () => {
  const { result, response } = responseRecorder();
  sendPermissionDenied(response, 'consultar el módulo Productos');

  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.errors.length, 1);
  assert.match(result.body.errors[0].msg, /^No tiene permiso para consultar el módulo Productos\./);
  assert.match(result.body.errors[0].msg, /Comuníquese con soporte para solicitar la habilitación\.$/);

  const error = permissionDeniedError('aprobar la conciliación');
  assert.equal(error.statusCode, 403);
  assert.equal(error.message, permissionDeniedMessage('aprobar la conciliación'));
});

test('aplica la misma política a usuarios distintos con permisos equivalentes', () => {
  const middleware = authorizeModulePermission('PRODUCTOS', 'view');
  const results = ['lflores', 'otro.usuario'].map((email) => {
    const { result, response } = responseRecorder();
    middleware({ userAuth: { email, role: 'OPERADOR', assign_permission: [] } }, response, () => {});
    return result;
  });

  assert.equal(results[0].status, 403);
  assert.deepEqual(results[0].body, results[1].body);
});

test('el Administrador conserva acceso fijo y el usuario autorizado continúa', () => {
  for (const userAuth of [
    { role: 'ADMINISTRADOR', assign_permission: [] },
    { role: 'OPERADOR', assign_permission: [{ module: 'TRANSFER_REVIEW', status: true, view: true }] },
  ]) {
    let nextCalls = 0;
    authorizeTransferReview('read')({ userAuth }, responseRecorder().response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  }
});

test('una instancia Sequelize conserva el permiso update para resolver revisiones', () => {
  const permission = assignPermission.build({
    module: 'TRANSFER_REVIEW',
    status: true,
    update: true,
  });
  let nextCalls = 0;

  authorizeTransferReview('resolve')({
    userAuth: { role: 'ENCARGADO', assign_permission: [permission] },
  }, responseRecorder().response, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
});

test('la revisión de traslados contextualiza la acción denegada en español', () => {
  const { result, response } = responseRecorder();
  authorizeTransferReview('approve')({
    userAuth: { role: 'OPERADOR', assign_permission: [{ module: 'TRANSFER_REVIEW', reports: false }] },
  }, response, () => {});

  assert.equal(result.status, 403);
  assert.match(result.body.errors[0].msg, /aprobar revisiones de traslados/);
  assert.match(result.body.errors[0].msg, /soporte/);
});

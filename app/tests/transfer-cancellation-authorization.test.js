'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeTransferCancellation } = require('../middlewares/authorize-transfer-cancellation');

const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('sólo ADMINISTRADOR puede dar de baja aunque el usuario tenga permiso modular', () => {
  const res = response(); let nextCalled = false;
  authorizeTransferCancellation({ userAuth: { role: 'OPERADOR', assign_permission: [{ module: 'TRASLADOS', delete: true }] } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false); assert.equal(res.statusCode, 403);
});

test('ADMINISTRADOR puede continuar con la baja', () => {
  const res = response(); let nextCalled = false;
  authorizeTransferCancellation({ userAuth: { role: 'ADMINISTRADOR' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true); assert.equal(res.statusCode, null);
});

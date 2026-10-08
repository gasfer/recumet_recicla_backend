'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { getValidateCreate, getValidateUpdate } = require('../middlewares/validators/user');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');

test('crear y editar usuarios acepta los seis roles y rechaza el rol combinado anterior', async () => {
  for (const validators of [getValidateCreate, getValidateUpdate]) {
    const roleValidators = validators[0].filter(chain => chain.builder.fields.includes('role'));
    for (const role of ['ADMINISTRADOR', 'ENCARGADO', 'OPERADOR', 'COMERCIAL', 'OPERADOR_BALANZA', 'LIQUIDACION_CAJA', 'BALANZA_CAJA', 'INVALIDO']) {
      const req = { body: { role }, params: {}, query: {} };
      for (const validator of roleValidators) await validator.run(req);
      assert.equal(validationResult(req).isEmpty(), !['INVALIDO', 'BALANZA_CAJA'].includes(role), role);
    }
  }
});

test('los nuevos roles requieren permisos asignados para operar cada módulo', () => {
  for (const role of ['COMERCIAL', 'OPERADOR_BALANZA', 'LIQUIDACION_CAJA']) {
    let authorized = false;
    const req = { userAuth: { role, assign_permission: [] } };
    const response = { status(code) { assert.equal(code, 403); return this; }, json() {} };
    const middleware = authorizeModulePermission('COMPRAS', 'create');
    middleware(req, response, () => { authorized = true; });
    assert.equal(authorized, false);
    req.userAuth.assign_permission = [{ module: 'COMPRAS', create: true, status: true }];
    middleware(req, response, () => { authorized = true; });
    assert.equal(authorized, true);
  }
});

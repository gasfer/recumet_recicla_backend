'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertAssignedBranch, assertWarehouseInBranch } = require('./purchase-location.service');

test('allows administrators and users assigned to the requested branch', () => {
  assert.doesNotThrow(() => assertAssignedBranch({ role: 'ADMINISTRADOR' }, 8));
  assert.doesNotThrow(() => assertAssignedBranch({ role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8 }] }, 8));
});

test('rejects non-admin users without an active assignment to the requested branch', () => {
  assert.throws(() => assertAssignedBranch({ role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 8, status: false }] }, 8), { status: 403 });
  assert.throws(() => assertAssignedBranch({ role: 'OPERADOR', assign_sucursales: [] }, 9), { status: 403 });
  assert.throws(() => assertAssignedBranch({ role: 'OPERADOR' }, 0), { status: 422 });
});

test('rejects a warehouse from another branch', () => {
  assert.doesNotThrow(() => assertWarehouseInBranch({ id_sucursal: 8 }, 8));
  assert.throws(() => assertWarehouseInBranch({ id_sucursal: 9 }, 8), { status: 422 });
});

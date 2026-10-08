'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assignPermission } = require('../database/config');
const { ensureProviderRegistrationPermission } = require('../services/user-role-permissions.service');
const router = require('../routes/provider');

test('ambos roles reciben solo consulta y creación y respetan permisos ya configurados', async (t) => {
  let existing = null;
  t.mock.method(assignPermission, 'findOne', async () => existing);
  const created = t.mock.method(assignPermission, 'create', async values => {
    assert.equal(values.view, true);
    assert.equal(values.create, true);
    assert.equal(values.update, false);
    assert.equal(values.delete, false);
    assert.equal(values.module, 'LISTA PROVEEDORES');
  });
  for (const role of ['OPERADOR_BALANZA', 'LIQUIDACION_CAJA']) {
    await ensureProviderRegistrationPermission({ id: 1, role });
  }
  assert.equal(created.mock.callCount(), 2);
  existing = { view: false, create: false };
  await ensureProviderRegistrationPermission({ id: 1, role: 'OPERADOR_BALANZA' });
  await ensureProviderRegistrationPermission({ id: 1, role: 'OPERADOR' });
  assert.equal(created.mock.callCount(), 2);
});

test('API de proveedores autoriza cada acción por separado para ambos roles', () => {
  for (const [method, path, action] of [
    ['get', '/', 'view'], ['post', '/', 'create'], ['post', '/pre-register', 'create'],
    ['put', '/:id', 'update'], ['put', '/destroyAndActive/:id', 'delete'],
    ['put', '/:id/commercial-validation', 'update'],
    ['post', '/:id/contacts', 'update'], ['delete', '/:id/contacts/:detailId', 'update'],
  ]) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method])?.route;
    const middleware = route?.stack.find(layer => layer.handle.modulePermission?.action === action)?.handle;
    assert.ok(middleware, `${method} ${path}`);
    for (const role of ['OPERADOR_BALANZA', 'LIQUIDACION_CAJA']) {
      let allowed = false;
      const res = { status(code) { assert.equal(code, 403); return this; }, json() {} };
      middleware({ userAuth: { role, assign_permission: [{ module: 'PROVEEDORES', view: true, create: true, update: false, delete: false }] } }, res, () => { allowed = true; });
      assert.equal(allowed, ['view', 'create'].includes(action));
      allowed = false;
      middleware({ userAuth: { role, assign_permission: [{ module: 'LISTA PROVEEDORES', view: true, create: true, update: true, delete: true }] } }, res, () => { allowed = true; });
      assert.equal(allowed, ['view', 'create'].includes(action), 'El permiso de lista nunca habilita edición o baja');
    }
  }
});

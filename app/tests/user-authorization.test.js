const test = require('node:test');
const assert = require('node:assert/strict');

const configPath = require.resolve('../database/config');
const middlewarePath = require.resolve('../middlewares/validators/validar-is-admin');
const originalConfig = require.cache[configPath];

const loadMiddlewareForRole = (role) => {
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { User: { findByPk: async () => ({ role }) } },
  };
  delete require.cache[middlewarePath];
  return require('../middlewares/validators/validar-is-admin').validarIsAdmin;
};

const callMiddleware = async (middleware) => {
  let nextCalled = false;
  let response;
  const res = {
    status: (status) => ({ json: (body) => { response = { status, body }; } }),
  };

  await middleware({ userAuth: { id: 1 } }, res, () => { nextCalled = true; });
  return { nextCalled, response };
};

test('autoriza gestión de usuarios solamente para Administrador', async () => {
  const result = await callMiddleware(loadMiddlewareForRole('ADMINISTRADOR'));

  assert.equal(result.nextCalled, true);
  assert.equal(result.response, undefined);
});

test('rechaza gestión de usuarios para Encargado y Operador', async () => {
  for (const role of ['ENCARGADO', 'OPERADOR']) {
    const result = await callMiddleware(loadMiddlewareForRole(role));

    assert.equal(result.nextCalled, false);
    assert.equal(result.response.status, 401);
  }
});

test.after(() => {
  if (originalConfig) {
    require.cache[configPath] = originalConfig;
  } else {
    delete require.cache[configPath];
  }
  delete require.cache[middlewarePath];
});

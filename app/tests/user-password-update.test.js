const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const configPath = require.resolve('../database/config');
const controllerPath = require.resolve('../controllers/user.controller');
const originalConfig = require.cache[configPath];

const loadUpdateUser = (user) => {
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: {
      User: { findByPk: async () => user },
      assignPermission: {},
      assignShift: {},
      assignSucursales: {},
    },
  };
  delete require.cache[controllerPath];
  return require('../controllers/user.controller').updateUser;
};

const updateRequest = async (body, user) => {
  let response;
  await loadUpdateUser(user)(
    { params: { id: 1 }, body },
    { status: (status) => ({ json: (payload) => { response = { status, payload }; } }) },
  );
  return response;
};

test('conserva la contraseña al editar sin enviar una nueva', async () => {
  let updatedBody;
  const user = {
    role: 'OPERADOR',
    update: async (body) => { updatedBody = body; },
  };

  const response = await updateRequest({ full_names: 'USUARIO ACTUALIZADO' }, user);

  assert.equal(response.status, 201);
  assert.equal(updatedBody.password, undefined);
  assert.equal(updatedBody.full_names, 'USUARIO ACTUALIZADO');
});

test('cifra una contraseña nueva cuando se solicita el cambio', async () => {
  let updatedBody;
  const user = {
    role: 'OPERADOR',
    update: async (body) => { updatedBody = body; },
  };

  const response = await updateRequest({ password: 'NuevaClaveSegura' }, user);

  assert.equal(response.status, 201);
  assert.equal(bcrypt.compareSync('NuevaClaveSegura', updatedBody.password), true);
});

test.after(() => {
  if (originalConfig) {
    require.cache[configPath] = originalConfig;
  } else {
    delete require.cache[configPath];
  }
  delete require.cache[controllerPath];
});

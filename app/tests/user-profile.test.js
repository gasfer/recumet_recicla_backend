const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const configPath = require.resolve('../database/config');
const controllerPath = require.resolve('../controllers/user.controller');
const originalConfig = require.cache[configPath];

const setupMockUser = (mockUserData) => {
    let storedUser = { ...mockUserData };
    const mockUserInstance = {
        ...storedUser,
        update: async (patch) => {
            Object.assign(storedUser, patch);
            Object.assign(mockUserInstance, patch);
            return mockUserInstance;
        }
    };

    require.cache[configPath] = {
        id: configPath,
        filename: configPath,
        loaded: true,
        exports: {
            User: {
                findByPk: async (id, options) => {
                    if (id === storedUser.id) {
                        return mockUserInstance;
                    }
                    return null;
                }
            },
            assignPermission: {},
            assignShift: {},
            assignSucursales: {},
            sequelize: {
                transaction: async () => ({ commit: async () => {}, rollback: async () => {} })
            }
        }
    };
    delete require.cache[controllerPath];
    return {
        controllers: require('../controllers/user.controller'),
        getStoredUser: () => storedUser,
        getUserInstance: () => mockUserInstance
    };
};

test('GET /user/profile/me retorna los datos del usuario autenticado', async () => {
    const salt = bcrypt.genSaltSync();
    const hash = bcrypt.hashSync('Password123!', salt);
    const { controllers } = setupMockUser({
        id: 10,
        full_names: 'JUAN PEREZ',
        email: 'juan@recumet.com',
        role: 'OPERADOR',
        cellphone: 70012345,
        photo: 'https://example.com/avatar.jpg',
        password: hash,
        assign_permission: [],
        assign_shift: [],
        assign_sucursales: []
    });

    let statusCode = 0;
    let responseBody = null;
    const req = { userAuth: { id: 10 } };
    const res = {
        status: (code) => {
            statusCode = code;
            return {
                json: (data) => { responseBody = data; }
            };
        }
    };

    await controllers.getMyProfile(req, res);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.ok, true);
    assert.equal(responseBody.user.full_names, 'JUAN PEREZ');
    assert.equal(responseBody.user.email, 'juan@recumet.com');
});

test('PUT /user/profile/me actualiza solo cellphone y photo ignorando campos restringidos', async () => {
    const { controllers, getStoredUser } = setupMockUser({
        id: 10,
        full_names: 'JUAN PEREZ',
        email: 'juan@recumet.com',
        role: 'OPERADOR',
        cellphone: 70012345,
        photo: null
    });

    let statusCode = 0;
    let responseBody = null;
    const req = {
        userAuth: { id: 10 },
        body: {
            cellphone: 77799911,
            photo: 'https://linkedin.com/in/photo.png',
            full_names: 'HACKED NAME',
            role: 'ADMINISTRADOR',
            email: 'hacked@email.com'
        }
    };
    const res = {
        status: (code) => {
            statusCode = code;
            return {
                json: (data) => { responseBody = data; }
            };
        }
    };

    await controllers.updateMyProfile(req, res);

    assert.equal(statusCode, 200);
    assert.equal(responseBody.ok, true);
    assert.equal(getStoredUser().cellphone, 77799911);
    assert.equal(getStoredUser().photo, 'https://linkedin.com/in/photo.png');
    assert.equal(getStoredUser().full_names, 'JUAN PEREZ');
    assert.equal(getStoredUser().role, 'OPERADOR');
    assert.equal(getStoredUser().email, 'juan@recumet.com');
});

test('PUT /user/profile/change-password valida contraseña actual antes de actualizar', async () => {
    const salt = bcrypt.genSaltSync();
    const currentHash = bcrypt.hashSync('PasswordActual123', salt);
    const { controllers, getStoredUser } = setupMockUser({
        id: 10,
        full_names: 'JUAN PEREZ',
        password: currentHash
    });

    // Intento con contraseña actual incorrecta
    let statusCode = 0;
    let responseBody = null;
    const badReq = {
        userAuth: { id: 10 },
        body: {
            current_password: 'ClaveEquivocada',
            new_password: 'NuevaClaveSegura2026',
            confirm_password: 'NuevaClaveSegura2026'
        }
    };
    const badRes = {
        status: (code) => {
            statusCode = code;
            return {
                json: (data) => { responseBody = data; }
            };
        }
    };

    await controllers.changeMyPassword(badReq, badRes);
    assert.equal(statusCode, 400);
    assert.equal(responseBody.ok, false);

    // Intento con contraseña actual correcta
    let okStatusCode = 0;
    let okResponseBody = null;
    const okReq = {
        userAuth: { id: 10 },
        body: {
            current_password: 'PasswordActual123',
            new_password: 'NuevaClaveSegura2026',
            confirm_password: 'NuevaClaveSegura2026'
        }
    };
    const okRes = {
        status: (code) => {
            okStatusCode = code;
            return {
                json: (data) => { okResponseBody = data; }
            };
        }
    };

    await controllers.changeMyPassword(okReq, okRes);
    assert.equal(okStatusCode, 200);
    assert.equal(okResponseBody.ok, true);
    assert.equal(bcrypt.compareSync('NuevaClaveSegura2026', getStoredUser().password), true);
});

test.after(() => {
    if (originalConfig) {
        require.cache[configPath] = originalConfig;
    } else {
        delete require.cache[configPath];
    }
    delete require.cache[controllerPath];
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerManualMovement } = require('../services/manual-kardex-movement.service');

test('el servicio rechaza roles que no son ADMINISTRADOR antes de abrir una transacción', async () => {
  await assert.rejects(
    registerManualMovement({ actorRole: 'ENCARGADO', actorUserId: 7 }),
    (error) => error.statusCode === 403,
  );
});

test('el servicio exige clave idempotente, tipo, cantidad y motivo válidos', async () => {
  const base = {
    actorRole: 'ADMINISTRADOR', actorUserId: 7,
    idempotencyKey: 'manual-test-1', idProduct: 10, idSucursal: 1, idStorage: 2,
    direction: 'INPUT', quantity: 0, reason: 'Ajuste por conteo físico',
  };
  await assert.rejects(registerManualMovement(base), /mayor a cero/);
  await assert.rejects(registerManualMovement({ ...base, quantity: 3, reason: 'corto' }), /entre 10 y 500/);
  await assert.rejects(registerManualMovement({ ...base, quantity: 3, idempotencyKey: '' }), /idempotencia/);
});

test('el administrador registra una entrada con fecha del servidor, historial y paridad verificada', async () => {
  const calls = { post: null, history: null, integrity: 0 };
  const dependencies = {
    sequelize: { transaction: async (operation) => operation({ LOCK: { UPDATE: 'UPDATE' } }) },
    models: {
      Product: { findOne: async () => ({ id: 10, cod: 'MP-10' }) },
      Storage: { findOne: async () => ({ id: 2, id_sucursal: 1 }) },
      History: { create: async (row) => { calls.history = row; } },
    },
    integrity: { verifyStockKardexIntegrity: async () => {
      calls.integrity += 1;
      return { consistent: true, physicalStock: '12.0000', availableQuantity: '12.0000' };
    } },
    applyExplicitEffect: async (movement) => {
      calls.post = movement;
      return { movement: { id: 88 }, repeated: false };
    },
  };
  const result = await registerManualMovement({
    actorRole: 'ADMINISTRADOR', actorUserId: 7,
    idempotencyKey: 'manual-test-valid', idProduct: 10, idSucursal: 1, idStorage: 2,
    direction: 'INPUT', quantity: '2.5', reason: 'Ajuste documentado por conteo físico',
    date: '2001-01-01',
  }, dependencies);

  assert.equal(result.balance, '12.0000');
  assert.equal(calls.integrity, 2);
  assert.equal(calls.post.date instanceof Date, true);
  assert.notEqual(calls.post.date.getFullYear(), 2001);
  assert.equal(calls.post.idempotencyKey, 'MANUAL_KARDEX:manual-test-valid');
  assert.equal(calls.history.id_user, 7);
});

test('el servicio rechaza una salida mayor al disponible después de retenciones', async () => {
  let posted = false;
  const dependencies = {
    sequelize: { transaction: async (operation) => operation({ LOCK: { UPDATE: 'UPDATE' } }) },
    models: {
      Product: { findOne: async () => ({ id: 10, cod: 'MP-10' }) },
      Storage: { findOne: async () => ({ id: 2, id_sucursal: 1 }) },
      Stock: { findOne: async () => ({ stock: 5 }) },
      History: { create: async () => undefined },
    },
    integrity: { verifyStockKardexIntegrity: async () => ({ consistent: true }) },
    hasAvailableStock: async () => ({ sufficient: false, available_stock: '1.0000' }),
    applyExplicitEffect: async () => { posted = true; },
  };
  await assert.rejects(registerManualMovement({
    actorRole: 'ADMINISTRADOR', actorUserId: 7,
    idempotencyKey: 'manual-test-held-output', idProduct: 10, idSucursal: 1, idStorage: 2,
    direction: 'OUTPUT', quantity: 2, reason: 'Salida física autorizada',
  }, dependencies), /supera el stock disponible/);
  assert.equal(posted, false);
});

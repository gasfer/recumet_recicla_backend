'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { affectedLocations } = require('../services/transfer-review-resolution.service');

const note = {
  type: 'FALTANTE_PARA_REVISION',
  id_product: 90,
  id_sucursal: 1,
  id_storage: 2,
  transfer: { id_sucursal_send: 3, id_storage_send: 4 },
};

test('la resolución de faltante verifica producto de diferencia y producto recibido', () => {
  assert.deepEqual(affectedLocations({
    note,
    detail: { id_product: 11 },
    strategy: 'FALTANTE_LOCALIZADO',
  }), [
    { productId: 90, sucursalId: 1, storageId: 2 },
    { productId: 11, sucursalId: 1, storageId: 2 },
  ]);
});

test('la resolución manual no altera inventario ni requiere verificación de saldo', () => {
  assert.deepEqual(affectedLocations({
    note,
    detail: { id_product: 11 },
    strategy: 'ACCION_MANUAL_VERIFICADA',
  }), []);
});

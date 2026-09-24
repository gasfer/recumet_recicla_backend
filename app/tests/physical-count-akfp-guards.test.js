'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../database/config');
const {
  assertNoOpenConflicts,
  validateCountResponsible,
} = require('../services/stock-reconciliation.service');

const record = { id: 8, id_product: 10, id_sucursal: 1, id_storage: 2 };

test('bloquea una segunda conciliación Stock–Kardex abierta en la misma ubicación', async (t) => {
  t.mock.method(db.StockReconciliationCase, 'findOne', async () => ({ id: 9 }));
  await assert.rejects(() => assertNoOpenConflicts({ record }), /#9 sigue abierta/i);
});

test('bloquea una conciliación de recepción abierta por producto original o diferencia', async (t) => {
  t.mock.method(db.StockReconciliationCase, 'findOne', async () => null);
  t.mock.method(db.sequelize, 'query', async () => [{ id: 7, registry_number: 'NTR-00021' }]);
  await assert.rejects(() => assertNoOpenConflicts({ record }), /NTR-00021.*abierta/i);
});

test('acepta responsable administrador y rechaza usuario inactivo, operador o ajeno a la sucursal', async (t) => {
  const responses = [
    { role: 'ADMINISTRADOR', assign_sucursales: [] },
    null,
    { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }] },
    { role: 'ENCARGADO', assign_sucursales: [] },
  ];
  t.mock.method(db.User, 'findOne', async () => responses.shift());
  await assert.doesNotReject(() => validateCountResponsible({ userId: 1, sucursalId: 1 }));
  await assert.rejects(() => validateCountResponsible({ userId: 2, sucursalId: 1 }), /responsable del conteo/i);
  await assert.rejects(() => validateCountResponsible({ userId: 3, sucursalId: 1 }), /responsable del conteo/i);
  await assert.rejects(() => validateCountResponsible({ userId: 4, sucursalId: 1 }), /responsable del conteo/i);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../database/config');
const { postOperationalMovement } = require('../services/caja-ledger.service');

test('rechaza egresos mayores al saldo y no escribe movimiento ni ledger', async () => {
  const restore = [];
  const stub = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
  let movementWrites = 0;
  let ledgerWrites = 0;
  stub(models.CajaSmall, 'findOne', async () => ({ id: 45, id_caja: 3 }));
  stub(models.CjAccount, 'findAll', async () => [{ id: 8, name: 'Efectivo', type: 'CASH', currency: 'BOB', id_bank: null }]);
  stub(models.CjSessionBalance, 'findOne', async () => ({ opening_amount: 50 }));
  stub(models.CjLedger, 'findAll', async () => [{ direction: 'IN', amount: 10 }, { direction: 'OUT', amount: 5 }]);
  stub(models.CjLedger, 'findOne', async () => null);
  stub(models.DetailsCajaSmall, 'create', async () => { movementWrites += 1; return { id: 1 }; });
  stub(models.CjLedger, 'create', async () => { ledgerWrites += 1; });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  try {
    await assert.rejects(postOperationalMovement({ branchId: 2, userId: 1, direction: 'OUT', amount: 56,
      paymentType: 'EFECTIVO', description: 'Compra', sourceType: 'INPUT', sourceId: 99, transaction }), /Saldo insuficiente/);
    await assert.rejects(postOperationalMovement({ branchId: 2, userId: 1, direction: 'OUT', amount: -1,
      paymentType: 'EFECTIVO', description: 'Compra', sourceType: 'INPUT', sourceId: 99, transaction }), /no puede ser negativo/);
    assert.equal(movementWrites, 0);
    assert.equal(ledgerWrites, 0);
  } finally {
    for (const [object, key, value] of restore.reverse()) object[key] = value;
  }
});

test('un reintento idempotente devuelve el movimiento ya contabilizado antes de volver a validar el saldo', async () => {
  const restore = [];
  const stub = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
  const duplicate = { id: 72, id_caja_small: 45, id_cuenta: 8, direction: 'OUT', source_type: 'INPUT', source_id: '99' };
  stub(models.CajaSmall, 'findOne', async () => ({ id: 45, id_caja: 3 }));
  stub(models.CjAccount, 'findAll', async () => [{ id: 8, name: 'Efectivo', type: 'CASH', currency: 'BOB', id_bank: null }]);
  stub(models.CjSessionBalance, 'findOne', async () => ({ opening_amount: 0 }));
  stub(models.CjLedger, 'findOne', async () => duplicate);
  stub(models.CjLedger, 'findAll', async () => { throw new Error('No debe recalcular el saldo en un reintento'); });
  try {
    const result = await postOperationalMovement({ branchId: 2, userId: 1, direction: 'OUT', amount: 80,
      paymentType: 'EFECTIVO', description: 'Compra', sourceType: 'INPUT', sourceId: 99, transaction: { LOCK: { UPDATE: 'UPDATE' } } });
    assert.equal(result, duplicate);
  } finally {
    for (const [object, key, value] of restore.reverse()) object[key] = value;
  }
});

test('rechaza reutilizar una clave de idempotencia para otro origen', async () => {
  const restore = [];
  const stub = (object, key, value) => { restore.push([object, key, object[key]]); object[key] = value; };
  stub(models.CajaSmall, 'findOne', async () => ({ id: 45, id_caja: 3 }));
  stub(models.CjAccount, 'findAll', async () => [{ id: 8, name: 'Efectivo', type: 'CASH', currency: 'BOB', id_bank: null }]);
  stub(models.CjSessionBalance, 'findOne', async () => ({ opening_amount: 100 }));
  stub(models.CjLedger, 'findOne', async () => ({ id: 72, id_caja_small: 45, id_cuenta: 8, direction: 'OUT', source_type: 'INPUT', source_id: '99' }));
  try {
    await assert.rejects(postOperationalMovement({ branchId: 2, userId: 1, direction: 'OUT', amount: 10,
      paymentType: 'EFECTIVO', description: 'Otra compra', sourceType: 'INPUT', sourceId: 100,
      transaction: { LOCK: { UPDATE: 'UPDATE' } } }), error => error.statusCode === 409);
  } finally {
    for (const [object, key, value] of restore.reverse()) object[key] = value;
  }
});

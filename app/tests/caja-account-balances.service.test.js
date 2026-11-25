const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAccountAmounts,
  assertAccountsMatch,
  mergeCloseAccountSummary,
} = require('../services/caja-account-balances.service');

const accounts = [
  { id: 1, name: 'Efectivo', type: 'CASH', currency: 'BOB' },
  { id: 2, name: 'Banco', type: 'BANK', currency: 'BOB' },
];

test('normaliza saldos por cuenta y exige valores válidos', () => {
  const amounts = normalizeAccountAmounts([{ id_cuenta: 1, opening_amount: '15.25' }], 'opening_amount', 'saldo de apertura');
  assert.equal(amounts.get(1), 15.25);
  assert.throws(() => normalizeAccountAmounts([
    { id_cuenta: 1, opening_amount: 10 }, { id_cuenta: 1, opening_amount: 20 },
  ], 'opening_amount', 'saldo de apertura'), /No repitas cuentas/);
  assert.throws(() => normalizeAccountAmounts([{ id_cuenta: 1, opening_amount: -1 }], 'opening_amount', 'saldo de apertura'), /no puede ser negativo/);
  assert.throws(() => normalizeAccountAmounts([{ id_cuenta: 1, opening_amount: 'abc' }], 'opening_amount', 'saldo de apertura'), /válido/);
});

test('rechaza cuentas externas a la sesión y detecta cuentas faltantes', () => {
  assert.throws(() => assertAccountsMatch(new Map([[3, 10]]), accounts), /no pertenece a esta sesión/);
  assert.throws(() => assertAccountsMatch(new Map([[1, 10]]), accounts), /todas las cuentas/);
  assert.doesNotThrow(() => assertAccountsMatch(new Map([[1, 10], [2, 20]]), accounts));
});

test('conserva en exportación cuentas declaradas en el cierre aunque falte su saldo inicial histórico', () => {
  const rows = mergeCloseAccountSummary(
    [{ id_cuenta: 1, name: 'Efectivo', currency: 'BOB', opening_amount: 10, inflows: 0, outflows: 0, expected_amount: 10 }],
    [{ id_cuenta: 7, currency: 'USD', expected_amount: 50, counted_amount: 48, difference: -2, account: { name: 'Cuenta USD' } }],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], {
    id_cuenta: 7, name: 'Cuenta USD', currency: 'USD', opening_amount: null,
    inflows: null, outflows: null, expected_amount: 50, snapshot_missing: true,
  });
});

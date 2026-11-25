'use strict';

const invalid = message => {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
};

function normalizeAccountAmounts(rows, field, label) {
  if (!Array.isArray(rows)) throw invalid('Los saldos por cuenta deben enviarse como una lista.');
  const amounts = new Map();
  for (const row of rows) {
    const accountId = Number(row?.id_cuenta);
    const rawAmount = row?.[field];
    const amount = rawAmount === '' || rawAmount == null ? NaN : Number(rawAmount);
    if (!Number.isInteger(accountId) || accountId < 1 || !Number.isFinite(amount)) {
      throw invalid(`Cada cuenta debe tener un identificador y un ${label} válido.`);
    }
    if (amount < 0) throw invalid(`El ${label} no puede ser negativo.`);
    if (amounts.has(accountId)) throw invalid('No repitas cuentas en los saldos enviados.');
    amounts.set(accountId, amount);
  }
  return amounts;
}

function assertAccountsMatch(amounts, accounts, { requireAll = true } = {}) {
  const allowed = new Set(accounts.map(account => Number(account.id)));
  for (const id of amounts.keys()) {
    if (!allowed.has(id)) throw invalid('Se recibió una cuenta que no pertenece a esta sesión de Caja.');
  }
  if (requireAll && accounts.some(account => !amounts.has(Number(account.id)))) {
    throw invalid('Debes confirmar el saldo de todas las cuentas de esta sesión.');
  }
}

function mergeCloseAccountSummary(accountSummary = [], closeDetails = []) {
  const summaries = new Map(accountSummary.map(account => [Number(account.id_cuenta), { ...account }]));
  for (const detail of closeDetails) {
    const id = Number(detail.id_cuenta);
    if (!summaries.has(id)) {
      summaries.set(id, {
        id_cuenta: id,
        name: detail.account?.name || `Cuenta ${id}`,
        currency: detail.currency || detail.account?.currency || 'SIN MONEDA',
        opening_amount: null,
        inflows: null,
        outflows: null,
        expected_amount: Number(detail.expected_amount || 0),
        snapshot_missing: true,
      });
    }
  }
  return [...summaries.values()];
}

module.exports = { normalizeAccountAmounts, assertAccountsMatch, mergeCloseAccountSummary };

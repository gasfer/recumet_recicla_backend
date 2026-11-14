'use strict';

const { exactAdd } = require('./number-formatter');

function addQuantity(target, unit, field, value) {
  const key = String(unit || 'SIN UNIDAD').trim().toUpperCase();
  const current = target.get(key) || { quantity_input: '0', quantity_output: '0', quantity_saldo: '0' };
  current[field] = exactAdd(current[field], value || 0);
  target.set(key, current);
}

function summarizePhysicalKardex(rows = []) {
  const totals = new Map();
  const categories = new Map();
  for (const row of rows) {
    const unit = row.product?.unit?.siglas;
    const category = row.product?.category?.name || 'SIN CATEGORÍA';
    const input = row.dataValues?.quantity_input ?? row.quantity_input ?? 0;
    const output = row.dataValues?.quantity_output ?? row.quantity_output ?? 0;
    const balance = row.dataValues?.quantity_saldo ?? row.quantity_saldo ?? 0;
    addQuantity(totals, unit, 'quantity_input', input);
    addQuantity(totals, unit, 'quantity_output', output);
    addQuantity(totals, unit, 'quantity_saldo', balance);
    if (!categories.has(category)) categories.set(category, new Map());
    const categoryTotals = categories.get(category);
    addQuantity(categoryTotals, unit, 'quantity_input', input);
    addQuantity(categoryTotals, unit, 'quantity_output', output);
    addQuantity(categoryTotals, unit, 'quantity_saldo', balance);
  }
  return { totals, categories };
}

function formatUnitTotals(totals, field, decimal = 2) {
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'es'))
    .map(([unit, quantities]) => `${unit}: ${Number(quantities[field] || 0).toLocaleString('de-DE', { minimumFractionDigits: decimal, maximumFractionDigits: decimal })}`)
    .join(' · ') || '—';
}

module.exports = { summarizePhysicalKardex, formatUnitTotals };

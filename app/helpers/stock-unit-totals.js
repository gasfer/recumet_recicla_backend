const { exactAdd } = require('./number-formatter');

const unitLabel = product => product?.unit?.siglas || 'SIN UNIDAD';

const addUnitQuantity = (totals, unit, quantity) => {
    const key = String(unit || 'SIN UNIDAD').trim() || 'SIN UNIDAD';
    totals[key] = exactAdd(totals[key] || 0, quantity || 0);
    return totals;
};

const formatUnitTotals = (totals, decimal = 2) => Object.entries(totals || {})
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([unit, value]) => `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: decimal, maximumFractionDigits: decimal })} ${unit}`)
    .join(' · ') || '—';

const normalizeStockOrder = (field, direction) => {
    const allowed = {
        'product.cod': ['product', 'cod'],
        'product.name': ['product', 'name'],
        'quantity_saldo': ['quantity_saldo'],
        'product.category.name': ['product', 'category', 'name'],
    };
    let requested = field;
    if (Array.isArray(requested)) requested = requested[0];
    if (typeof requested === 'string' && requested.startsWith('[')) {
        try { requested = JSON.parse(requested)[0]; } catch (_) { /* use default */ }
    }
    const path = allowed[requested] || allowed['product.cod'];
    const order = String(direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    return [...path, order];
};

module.exports = { unitLabel, addUnitQuantity, formatUnitTotals, normalizeStockOrder };

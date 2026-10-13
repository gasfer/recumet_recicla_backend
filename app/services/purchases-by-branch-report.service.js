'use strict';

const { QueryTypes, Op } = require('sequelize');
const db = require('../database/config');
const { normalizeReportFilters, parseFlexibleDate } = require('./inventory-consolidated-query.service');

function purchasePeriod(filters) {
  const end = filters.cutoffInfo.cutoffMoment.clone();
  const mode = String(filters.rawFilterBy).toUpperCase();
  if (!['RANGE', 'DAY', 'MONTH', 'YEAR'].includes(mode) ||
    (['RANGE', 'DAY'].includes(mode) && (!parseFlexibleDate(filters.date1) || (filters.date2 && !parseFlexibleDate(filters.date2)))) ||
    (mode === 'MONTH' && (!/^(0?[1-9]|1[0-2])$/.test(String(filters.date1)) || !/^\d{4}$/.test(String(filters.date2)))) ||
    (mode === 'YEAR' && !/^\d{4}$/.test(String(filters.date1)))) {
    const error = new Error('Seleccione un período válido para el reporte de compras.'); error.statusCode = 400; throw error;
  }
  const start = mode === 'RANGE' ? parseFlexibleDate(filters.date1) : end.clone().startOf(mode === 'MONTH' ? 'month' : mode === 'YEAR' ? 'year' : 'day');
  if (!start || !start.isValid() || start.isAfter(end)) {
    const error = new Error('Seleccione un período válido para el reporte de compras.');
    error.statusCode = 400;
    throw error;
  }
  return { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD'), label: `${start.format('DD/MM/YYYY')} AL ${end.format('DD/MM/YYYY')}` };
}

async function buildPurchasesByBranchReport(query = {}, { byProvider = false } = {}) {
  const filters = normalizeReportFilters(query);
  const period = purchasePeriod(filters);
  const conditions = [];
  for (const key of ['id_provider', 'id_type_provider']) {
    if (query[key] && !/^[1-9]\d*$/.test(String(query[key]))) {
      const error = new Error('Seleccione un proveedor o tipo válido.'); error.statusCode = 400; throw error;
    }
  }
  const replacements = { start: period.start, end: period.end };
  if (query.id_provider) { conditions.push('i.id_provider = :provider'); replacements.provider = Number(query.id_provider); }
  if (query.id_type_provider) { conditions.push('pr.id_type_provider = :providerType'); replacements.providerType = Number(query.id_type_provider); }
  for (const [key, column] of [['sucursales', 'i.id_sucursal'], ['storages', 'i.id_storage'], ['products', 'p.id'], ['categories', 'p.id_category']]) {
    const ids = filters[key];
    if (ids.some(id => !/^\d+$/.test(id) || Number(id) <= 0)) {
      const error = new Error('Seleccione filtros válidos para el reporte.'); error.statusCode = 400; throw error;
    }
    if (ids.length) { conditions.push(`${column} IN (:${key})`); replacements[key] = ids.map(Number); }
  }
  if (filters.querySearch) { conditions.push('(p.cod ILIKE :search OR p.name ILIKE :search)'); replacements.search = `%${filters.querySearch}%`; }
  const branches = await db.Sucursal.findAll({ attributes: ['id', 'name'], where: filters.sucursales.length ? { id: { [Op.in]: filters.sucursales } } : {}, order: [['name', 'ASC']], raw: true });
  const rows = await db.sequelize.query(`
    SELECT p.id, p.cod, p.name, COALESCE(u.siglas, '') AS unit,
      COALESCE(c.name, 'SIN CATEGORÍA') AS category, i.id_sucursal,
      ${byProvider ? "i.id_provider, COALESCE(pr.full_names, 'SIN PROVEEDOR') AS provider_name," : ''}
      SUM(d.quantity) AS quantity, SUM(COALESCE(d.total, d.quantity * d.cost, 0)) AS amount
    FROM inputs i LEFT JOIN providers pr ON pr.id = i.id_provider JOIN details_inputs d ON d.id_input = i.id
    JOIN products p ON p.id = d.id_product
    LEFT JOIN units u ON u.id = p.id_unit LEFT JOIN categories c ON c.id = p.id_category
    WHERE i.status = 'ACTIVE' AND (d.status = 'ACTIVE' OR d.status IS NULL)
      AND (COALESCE(i.date_voucher, i."createdAt") AT TIME ZONE 'America/La_Paz')::date BETWEEN :start::date AND :end::date
      ${conditions.length ? 'AND ' + conditions.join(' AND ') : ''}
    GROUP BY p.id, p.cod, p.name, u.siglas, c.name, i.id_sucursal ${byProvider ? ', i.id_provider, pr.full_names' : ''}
    ORDER BY category, p.cod, p.id ${byProvider ? ', provider_name, i.id_provider' : ''}
  `, { replacements, type: QueryTypes.SELECT });
  const products = new Map();
  const providers = new Map();
  for (const row of rows) {
    const key = byProvider ? `${row.id}:${row.id_provider}` : row.id;
    if (byProvider && !providers.has(row.id_provider)) providers.set(row.id_provider, row.provider_name);
    if (!products.has(key)) products.set(key, { id: row.id, code: row.cod, name: row.name, providerId: row.id_provider, providerName: row.provider_name, unit: row.unit, category: row.category, branches: {}, quantity: 0, amount: 0 });
    const product = products.get(key);
    const quantity = Number(row.quantity) || 0, amount = Number(row.amount) || 0;
    product.branches[row.id_sucursal] = { quantity, amount, average: quantity ? amount / quantity : 0 };
    product.quantity += quantity; product.amount += amount;
  }
  return { byProvider, period, branches, providers: [...providers].map(([id, name]) => ({ id, name })), products: [...products.values()], filters };
}

module.exports = { purchasePeriod, buildPurchasesByBranchReport };

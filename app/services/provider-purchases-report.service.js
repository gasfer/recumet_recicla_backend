'use strict';
const db = require('../database/config');
const { QueryTypes } = require('sequelize');
const { normalizeScopedQuery } = require('./provider-management.service');
const { buildPurchaseDetailQuery } = require('./provider-management-query');
const { selectedReportFilters } = require('./report-selected-filters.service');

async function selectedProviderPurchaseFilters(q) {
  const base = await selectedReportFilters({
    id_sucursales: q.id_sucursales, id_storages: q.id_storages,
    category_ids: q.id_categories, id_products: q.id_products,
    id_provider: q.id_provider, id_type_provider: q.id_type_provider,
    query: q.query,
  });
  const lines = base ? base.split('\n') : [];
  if (q.status !== undefined) lines.push('Estado: ' + (q.status ? 'Activos' : 'Inactivos'));
  if (q.estado_registro) lines.push('Validación: ' + (q.estado_registro === 'VALIDADO' ? 'Validado' : 'Pendiente'));
  const dateLabels = { ALL: 'Todo el historial', DAY: 'Día', MONTH: 'Mes', YEAR: 'Año', RANGE: 'Rango' };
  lines.push('Período: ' + dateLabels[q.date_mode]);
  if (q.date_mode !== 'ALL') {
    lines.push('Fecha: ' + q.date + (q.date_mode === 'RANGE' ? ' al ' + q.date_end : ''));
    lines.push('Referencia: ' + (q.date_basis === 'LATEST' ? 'Última compra del proveedor' : 'Compras del período'));
  }
  if (q.id_commercial_user) {
    const user = await db.User.findOne({ attributes: ['full_names'], where: { id: q.id_commercial_user }, raw: true });
    lines.push('Responsable comercial: ' + (user?.full_names || q.id_commercial_user));
  }
  lines.push('Estado de compras: Activas');
  if (q.payment_type) lines.push('Pago: ' + q.payment_type);
  if (q.purchase_old_customer !== undefined) lines.push('Proveedor antiguo: ' + (q.purchase_old_customer ? 'Sí' : 'No'));
  if (q.purchase_with_pickup !== undefined) lines.push('Con recojo: ' + (q.purchase_with_pickup ? 'Sí' : 'No'));
  if (q.purchase_referral_sources) lines.push('Cómo nos conociste: ' + q.purchase_referral_sources);
  if (q.purchase_search) lines.push('Búsqueda compra: ' + q.purchase_search);
  const labels = {
    department: 'Departamento', city: 'Ciudad', type_registry: 'Tipo de registro',
    origin_channel: 'Canal de origen', relationship_status: 'Estado de relación', service_mode: 'Modalidad de servicio',
    old_customer: 'Proveedor antiguo', with_pickup: 'Con recojo', has_contact: 'Con contacto', main_contact: 'Contacto principal',
    has_document: 'Con CI / NIT', has_bank_account: 'Con cuenta bancaria', activity: 'Actividad de compras', frequency: 'Frecuencia',
    min_amount: 'Importe mínimo', max_amount: 'Importe máximo', min_count: 'Compras mínimas', max_count: 'Compras máximas',
    min_balance: 'Saldo pendiente mínimo', max_balance: 'Saldo pendiente máximo', min_days: 'Días sin compra mínimos', max_days: 'Días sin compra máximos',
    min_average_days: 'Días promedio mínimos', max_average_days: 'Días promedio máximos',
  };
  for (const [key, label] of Object.entries(labels)) {
    if (q[key] === undefined || q[key] === null || q[key] === '') continue;
    const value = typeof q[key] === 'boolean' ? (q[key] ? 'Sí' : 'No') : q[key];
    lines.push(label + ': ' + value);
  }
  return lines.join('\n');
}

async function buildProviderPurchasesReport(raw = {}, user, { providerManagement = false } = {}) {
  const { q, branches } = await normalizeScopedQuery({ ...raw, ...(providerManagement ? { status: true } : {}), purchase_status: 'ACTIVE', page: 1, limit: 50 }, user);
  const { sql, replacements } = buildPurchaseDetailQuery(q, branches, { providerManagement });
  const [data, selectedFilters] = await Promise.all([
    db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT }), selectedProviderPurchaseFilters(q),
  ]);
  return {
    selectedFilters,
    purchaseStatus: q.purchase_status || 'ACTIVE',
    period: { label: q.date_mode === 'ALL' ? 'TODO EL HISTORIAL' : q.date + (q.date_mode === 'RANGE' ? ' AL ' + q.date_end : '') },
    fileDate: q.date_mode === 'ALL' ? 'historial' : (q.date_mode === 'RANGE' ? q.date_end : q.date),
    rows: data.map(row => ({ ...row, providerType: row.provider_type, quantity: Number(row.quantity) || 0,
      amount: Number(row.amount) || 0, average: Number(row.quantity) ? Number(row.amount) / Number(row.quantity) : 0 })),
  };
}
module.exports = { buildProviderPurchasesReport, selectedProviderPurchaseFilters };

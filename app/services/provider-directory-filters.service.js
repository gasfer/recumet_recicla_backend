'use strict';

const LABELS = {
  entity_type: 'Tipo de entidad',
  estado_registro: 'Registro', query: 'Proveedor',
  id_sucursal: 'Sucursales', id_sucursales: 'Sucursales', id_storage: 'Almacenes', id_storages: 'Almacenes',
  id_categories: 'Categorías', id_products: 'Productos', id_type_provider: 'Tipo de proveedor', id_commercial_user: 'Responsable comercial',
  department: 'Departamento', city: 'Municipio', activity: 'Compras', frequency: 'Frecuencia',
  min_amount: 'Compras mínimas (Bs)', max_amount: 'Compras máximas (Bs)', min_count: 'Cantidad mínima de compras', max_count: 'Cantidad máxima de compras',
  min_balance: 'Saldo mínimo (Bs)', max_balance: 'Saldo máximo (Bs)', min_days: 'Días sin comprar · mínimo', max_days: 'Días sin comprar · máximo',
  min_average_days: 'Frecuencia mínima (días)', max_average_days: 'Frecuencia máxima (días)',
  type_registry: 'Tipo de comprobante', origin_channel: 'Canal de origen', relationship_status: 'Relación comercial',
  service_mode: 'Modalidad', old_customer: 'Cliente antiguo', with_pickup: 'Con recojo',
  has_contact: 'Con contacto', main_contact: 'Contacto principal', has_document: 'Con CI/NIT', has_bank_account: 'Con cuenta bancaria',
};
const CATALOGS = { id_sucursal: 'branches', id_sucursales: 'branches', id_storage: 'storages', id_storages: 'storages', id_categories: 'categories', id_products: 'products', id_type_provider: 'types', id_commercial_user: 'users' };
const VALUES = {
  PRIVATE: 'Privada', PUBLIC: 'Pública', NGO_FOUNDATION: 'ONG / Fundación', OTHER: 'Otra',
  ALL: 'Todos', POSITIVE: 'Mayores a Bs 0', WITH: 'Con compras registradas', WITHOUT: 'Sin compras',
  PENDIENTE: 'Pendiente de validación', VALIDADO: 'Validado',
  WEEKLY: 'Semanal', BIWEEKLY: 'Quincenal', MONTHLY: 'Mensual', QUARTERLY: 'Trimestral', ANNUAL: 'Anual', UNDETERMINED: 'Sin determinar',
};
const selected = value => value !== undefined && value !== null && String(value).trim() !== '';

function periodLabel(q) {
  if (!q.date_mode) return null;
  if (q.date_mode === 'ALL') return 'Todo el historial';
  if (q.date_mode === 'YEAR') return String(q.date);
  const date = new Date(`${q.date}${q.date_mode === 'MONTH' ? '-01' : ''}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  if (q.date_mode === 'MONTH') {
    const label = date.toLocaleDateString('es-BO', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const format = value => value.toLocaleDateString('es-BO', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  return q.date_mode === 'RANGE' ? `${format(date)} al ${format(new Date(q.date_end + 'T12:00:00Z'))}` : format(date);
}

function providerDirectoryFilters(query, catalogs = {}) {
  const filters = [];
  const period = periodLabel(query);
  if (period) filters.push(`Período: ${period}`);
  if (selected(query.status)) filters.push(`Estado: ${query.status === true || query.status === 'true' ? 'Activos' : 'Inactivos'}`);
  for (const [key, value] of Object.entries(query)) {
    if (!LABELS[key] || !selected(value)) continue;
    const catalog = catalogs[CATALOGS[key]];
    const display = catalog ? String(value).split(',').map(id => {
      const item = catalog.find(c => String(c.id) === id.trim());
      return item?.name || item?.full_names || id;
    }).join(', ') : value === true || value === 'true' ? 'Sí' : value === false || value === 'false' ? 'No' : VALUES[value] || String(value);
    filters.push(`${LABELS[key]}: ${display}`);
  }
  return filters;
}

module.exports = { providerDirectoryFilters, periodLabel };

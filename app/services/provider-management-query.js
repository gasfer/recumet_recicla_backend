'use strict';
const { kilogramUnitSql } = require('../helpers/kilogram-units');

const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const present = value => value !== undefined && value !== null && value !== '';

function parseIds(value) {
  if (Array.isArray(value)) return value.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (typeof value === 'string' && value.trim()) return value.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
  if (present(value) && Number.isInteger(Number(value)) && Number(value) > 0) return [Number(value)];
  return [];
}

function normalizeQuery(raw = {}) {
  const q = { ...raw };
  q.id_categories = parseIds(q.id_categories || q.id_category);
  q.id_products = parseIds(q.id_products || q.id_product);
  delete q.id_category;
  delete q.id_product;

  q.id_sucursales = parseIds(q.id_sucursales || q.id_sucursal);
  q.id_storages = parseIds(q.id_storages || q.id_storage);
  delete q.id_sucursal;
  delete q.id_storage;

  for (const key of ['page', 'limit', 'id_provider', 'id_type_provider', 'id_commercial_user']) {
    if (!present(q[key])) { delete q[key]; continue; }
    if (!/^\d+$/.test(String(q[key])) || Number(q[key]) < 1 || !Number.isSafeInteger(Number(q[key]))) fail(`Valor inválido: ${key}`);
    q[key] = Number(q[key]);
  }
  q.page ||= 1; q.limit ||= 50;
  if (present(q.entity_type) && !['PRIVATE', 'PUBLIC', 'NGO_FOUNDATION', 'OTHER'].includes(q.entity_type)) fail('Tipo de entidad inválido');
  if (!q.id_type_provider) delete q.entity_type;
  if (q.limit > 200) fail('Máximo 200 proveedores por página');
  for (const key of ['status', 'old_customer', 'with_pickup', 'has_contact', 'has_document', 'has_bank_account']) {
    if (!present(q[key])) { delete q[key]; continue; }
    if (![true, false, 'true', 'false'].includes(q[key])) fail(`Valor inválido: ${key}`);
    q[key] = q[key] === true || q[key] === 'true';
  }
  for (const key of ['min_amount', 'max_amount', 'min_count', 'max_count', 'min_balance', 'max_balance', 'min_days', 'max_days', 'min_average_days', 'max_average_days']) {
    if (!present(q[key])) { delete q[key]; continue; }
    if (!Number.isFinite(Number(q[key])) || Number(q[key]) < 0) fail(`Valor inválido: ${key}`);
    q[key] = Number(q[key]);
  }
  for (const name of ['amount', 'count', 'balance', 'days', 'average_days']) {
    if (present(q[`min_${name}`]) && present(q[`max_${name}`]) && q[`min_${name}`] > q[`max_${name}`]) fail('El mínimo no puede superar al máximo');
  }
  for (const [key, values] of Object.entries({ date_mode: ['ALL', 'DAY', 'MONTH', 'YEAR', 'RANGE'], date_basis: ['PURCHASES', 'LATEST'], type_registry: ['FICHA', 'BOLETA', 'SIN FICHA'], estado_registro: ['PENDIENTE', 'VALIDADO'], activity: ['ALL', 'POSITIVE', 'WITH', 'WITHOUT'], frequency: ['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'UNDETERMINED'] })) {
    if (present(q[key]) && !values.includes(q[key])) fail(`Valor inválido: ${key}`);
  }
  q.date_mode ||= 'ALL'; q.date_basis ||= 'PURCHASES';
  if (q.date_mode !== 'ALL') {
    const date = String(q.date || '');
    let start, end;
    if (q.date_mode === 'YEAR') {
      if (!/^\d{4}$/.test(date) || Number(date) < 1900 || Number(date) > 9998) fail('Seleccione un año válido');
      start = `${date}-01-01`; end = `${Number(date) + 1}-01-01`;
    } else if (q.date_mode === 'MONTH') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) fail('Seleccione un mes válido');
      start = `${date}-01`; const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); end = d.toISOString().slice(0, 10);
    } else {
      const check = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      start = date; const last = q.date_mode === 'RANGE' ? String(q.date_end || '') : date;
      if (!check(start) || !check(last) || start > last) fail('Seleccione fechas válidas y ordenadas');
      const d = new Date(`${last}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); end = d.toISOString().slice(0, 10);
    }
    q.start = `${start}T00:00:00-04:00`; q.end = `${end}T00:00:00-04:00`;
  }
  return q;
}

function buildQuery(q, branchIds = null, { purchaseDetails = false, unpaginated = false } = {}) {
  const replacements = { limit: q.limit, offset: (q.page - 1) * q.limit };
  const context = [q.purchase_status === 'INACTIVE' ? "i.status = 'INACTIVE'" : "i.status = 'ACTIVE'", 'i.voided_at IS NULL'];
  if (q.payment_type) { context.push('i.type = :payment_type'); replacements.payment_type = q.payment_type; }
  if (q.purchase_referral_sources) { context.push('i.referral_sources = :purchase_referral_sources'); replacements.purchase_referral_sources = q.purchase_referral_sources; }
  for (const [key, column] of [['purchase_old_customer', 'old_customer'], ['purchase_with_pickup', 'with_pickup']]) {
    if (q[key] !== undefined) { context.push('i.' + column + ' = :' + key); replacements[key] = q[key]; }
  }
  if (q.purchase_search) { context.push('i.' + (q.purchase_search_type === 'registry_number' ? 'registry_number' : 'cod') + ' ILIKE :purchase_search'); replacements.purchase_search = '%' + q.purchase_search + '%'; }
  const purchase = []; const detail = ["d.status = 'ACTIVE'", 'd.removed_at IS NULL', 'pr.status = TRUE']; const provider = [];
  const bind = (key, value) => { replacements[key] = value; return `:${key}`; };
  if (branchIds) context.push(branchIds.length ? `i.id_sucursal IN (${bind('allowed_branches', branchIds)})` : 'FALSE');
  if (branchIds) provider.push(branchIds.length ? '(p.id_sucursal IN (:allowed_branches) OR EXISTS (SELECT 1 FROM context_inputs ci WHERE ci.id_provider = p.id))' : 'FALSE');
  if (q.id_sucursales?.length) context.push(`i.id_sucursal IN (${bind('id_sucursales', q.id_sucursales)})`);
  if (q.id_storages?.length) context.push(`i.id_storage IN (${bind('id_storages', q.id_storages)})`);
  if (present(q.type_registry)) purchase.push(`i.type_registry = ${bind('type_registry', q.type_registry)}`);
  if (q.start && q.date_basis === 'PURCHASES') purchase.push(`i.date_voucher >= ${bind('start', q.start)}::timestamptz AND i.date_voucher < ${bind('end', q.end)}::timestamptz`);
  if (q.id_products?.length) detail.push(`pr.id IN (${bind('id_products', q.id_products)})`);
  if (q.id_categories?.length) detail.push(`pr.id_category IN (${bind('id_categories', q.id_categories)})`);
  const hasProductOrCategory = Boolean(q.id_products?.length || q.id_categories?.length);
  if (hasProductOrCategory) purchase.push('EXISTS (SELECT 1 FROM selected_details sd WHERE sd.id_input = i.id)');
  const hasPurchaseFilter = purchase.length > 0;
  if (hasPurchaseFilter && q.activity !== 'WITHOUT') provider.push('COALESCE(a.total_inputs, 0) > 0');
  for (const key of ['status', 'id_type_provider', 'estado_registro']) if (present(q[key])) provider.push(`p.${key} = ${bind(key, q[key])}`);
  if (q.id_provider) provider.push(`p.id = ${bind('id_provider', q.id_provider)}`);
  for (const key of ['origin_channel', 'relationship_status', 'id_commercial_user', 'entity_type']) if (present(q[key])) provider.push(`COALESCE(c.${key}, p.${key}) = ${bind(key, q[key])}`);
  if (present(q.service_mode)) provider.push(`p.service_mode = ${bind('service_mode', q.service_mode)}`);
  if (present(q.department)) provider.push(`(UPPER(TRIM(p.department)) = UPPER(TRIM(${bind('department', q.department)})) OR EXISTS (SELECT 1 FROM provider_branches b WHERE b.id_provider = p.id AND b.status = TRUE AND UPPER(TRIM(b.department)) = UPPER(TRIM(:department))))`);
  if (present(q.city)) provider.push(`EXISTS (SELECT 1 FROM provider_branches b WHERE b.id_provider = p.id AND b.status = TRUE AND UPPER(TRIM(b.city)) = UPPER(TRIM(${bind('city', q.city)}))${present(q.department) ? ' AND UPPER(TRIM(b.department)) = UPPER(TRIM(:department))' : ''})`);
  for (const key of ['old_customer', 'with_pickup']) if (present(q[key])) provider.push(`l.${key} = ${bind(key, q[key])}`);
  if (q.start && q.date_basis === 'LATEST') provider.push(`l.date_voucher >= ${bind('start', q.start)}::timestamptz AND l.date_voucher < ${bind('end', q.end)}::timestamptz`);
  const contactExists = 'EXISTS (SELECT 1 FROM provider_contacts ct WHERE ct.id_provider = p.id AND ct.status = TRUE AND ct.is_main_contact = TRUE)';
  if (present(q.has_contact)) provider.push(`${q.has_contact ? '' : 'NOT '}${contactExists}`);
  if (present(q.main_contact)) provider.push(`EXISTS (SELECT 1 FROM provider_contacts ct WHERE ct.id_provider = p.id AND ct.status = TRUE AND ct.is_main_contact = TRUE AND (ct.full_name ILIKE ${bind('main_contact', `%${q.main_contact}%`)} OR ct.cellphone ILIKE :main_contact OR ct.email ILIKE :main_contact))`);
  if (present(q.has_document)) provider.push(`(NULLIF(TRIM(COALESCE(p.number_document, '')), '') IS ${q.has_document ? 'NOT ' : ''}NULL)`);
  if (present(q.has_bank_account)) provider.push(`${q.has_bank_account ? '' : 'NOT '}EXISTS (SELECT 1 FROM provider_bank_accounts ba WHERE ba.id_provider = p.id AND ba.status = TRUE)`);
  if (q.activity === 'WITH') provider.push('COALESCE(a.total_inputs, 0) > 0');
  if (q.activity === 'WITHOUT') provider.push('COALESCE(a.total_inputs, 0) = 0');
  if (q.activity === 'POSITIVE') provider.push('COALESCE(a.total_amount, 0) > 0');
  const expressions = { amount: 'COALESCE(a.total_amount, 0)', count: 'COALESCE(a.total_inputs, 0)', balance: 'COALESCE(bal.balance, 0)', days: "(CURRENT_DATE - (l.date_voucher AT TIME ZONE 'America/La_Paz')::date)", average_days: 'f.average_days' };
  for (const [name, expression] of Object.entries(expressions)) for (const [prefix, op] of [['min', '>='], ['max', '<=']]) {
    const key = `${prefix}_${name}`; if (present(q[key])) provider.push(`${expression} ${op} ${bind(key, q[key])}`);
  }
  const frequency = "CASE WHEN f.average_days IS NULL THEN 'UNDETERMINED' WHEN ROUND(f.average_days) <= 10 THEN 'WEEKLY' WHEN ROUND(f.average_days) <= 17 THEN 'BIWEEKLY' WHEN ROUND(f.average_days) <= 45 THEN 'MONTHLY' WHEN ROUND(f.average_days) <= 120 THEN 'QUARTERLY' ELSE 'ANNUAL' END";
  if (q.frequency) provider.push(`${frequency} = ${bind('frequency', q.frequency)}`);
  if (present(q.query)) {
    const searchColumns = { full_names: 'p.full_names', number_document: 'p.number_document', cellphone: 'p.cellphone::text', direction: 'p.direction', name_contact: 'p.name_contact', cellphone_contact: 'p.cellphone_contact::text', 'type.name': 't.name', 'sector.name': 's.name', 'category.name': 'cat.name' };
    const expression = searchColumns[q.type] || "CONCAT_WS(' ', p.full_names, p.number_document, p.commercial_name)";
    provider.push(`${expression} ILIKE ${bind('query', `%${q.query}%`)}`);
  }
  const sorts = { id: 'id', full_names: 'full_names', date_last_input: 'date_last_input', total_inputs: 'total_inputs', total_products: 'total_products', total_amount: 'total_amount', saldo_cuentas_por_pagar: 'saldo_cuentas_por_pagar', number_document: 'number_document' };
  const order = String(q.order).toUpperCase() === 'ASC' || q.order === '1' ? 'ASC' : 'DESC';
  const exportFields = unpaginated && purchaseDetails ? `,
      (SELECT jsonb_agg(jsonb_build_object('department', pb.department, 'city', pb.city, 'address', pb.address) ORDER BY pb.is_main DESC NULLS LAST, pb.id)
        FROM provider_branches pb WHERE pb.id_provider = p.id AND pb.status = TRUE) report_locations,
      (SELECT jsonb_build_object('name', pc.full_name, 'cellphone', pc.cellphone) FROM provider_contacts pc
        WHERE pc.id_provider = p.id AND pc.status = TRUE ORDER BY pc.is_main_contact DESC NULLS LAST, pc.id LIMIT 1) report_contact,
      em.report_branches, em.report_kg_amount` : '';
  const exportMetrics = unpaginated && purchaseDetails ? `export_metrics AS (
      SELECT mi.id_provider, string_agg(DISTINCT su.name, ', ' ORDER BY su.name) report_branches,
        SUM(sd.total) FILTER (WHERE ${kilogramUnitSql('u')}) report_kg_amount
      FROM matched mi LEFT JOIN sucursals su ON su.id = mi.id_sucursal
      LEFT JOIN selected_details sd ON sd.id_input = mi.id LEFT JOIN units u ON u.id = sd.id_unit GROUP BY mi.id_provider),` : '';
  const ctes = `WITH context_inputs AS (SELECT i.* FROM inputs i WHERE ${context.join(' AND ')}),
    selected_details AS (SELECT d.id_input, d.quantity, pr.id_unit, COALESCE(d.total, d.quantity * d.cost, 0) total ${purchaseDetails ? ', d.id_product, d.cost' : ''} FROM details_inputs d JOIN products pr ON pr.id = d.id_product WHERE ${detail.join(' AND ')}),
    matched AS (SELECT i.* FROM context_inputs i ${purchase.length ? `WHERE ${purchase.join(' AND ')}` : ''}),
    detail_amounts AS (SELECT id_input, SUM(total) total FROM selected_details GROUP BY id_input),
    amounts AS (SELECT i.id_provider, COUNT(DISTINCT i.id) total_inputs, SUM(da.total) total_amount FROM matched i JOIN detail_amounts da ON da.id_input = i.id GROUP BY i.id_provider),
    quantities AS (SELECT i.id_provider, sd.id_unit, SUM(sd.quantity) quantity FROM matched i JOIN selected_details sd ON sd.id_input = i.id GROUP BY i.id_provider, sd.id_unit),
    quantities_json AS (SELECT q.id_provider, jsonb_agg(jsonb_build_object('unit', COALESCE(u.siglas, 'Sin unidad'), 'quantity', q.quantity)) quantities,
      SUM(q.quantity) FILTER (WHERE ${kilogramUnitSql('u')}) total_kg FROM quantities q LEFT JOIN units u ON u.id = q.id_unit GROUP BY q.id_provider),
    latest AS (SELECT DISTINCT ON (i.id_provider) i.id_provider, i.id, i.date_voucher, i.old_customer, i.with_pickup FROM context_inputs i
      WHERE EXISTS (SELECT 1 FROM selected_details sd WHERE sd.id_input = i.id) ORDER BY i.id_provider, i.date_voucher DESC NULLS LAST, i.id DESC),
    delivery_days AS (SELECT DISTINCT i.id_provider, (i.date_voucher AT TIME ZONE 'America/La_Paz')::date delivery_date FROM context_inputs i WHERE EXISTS (SELECT 1 FROM selected_details sd WHERE sd.id_input = i.id)),
    frequency_stats AS (SELECT id_provider, CASE WHEN COUNT(delivery_date) > 1 THEN (MAX(delivery_date) - MIN(delivery_date))::numeric / (COUNT(delivery_date) - 1) END average_days FROM delivery_days GROUP BY id_provider),
    balances AS (SELECT ap.id_provider, SUM(ap.monto_restante) balance FROM accounts_payables ap JOIN inputs i ON i.id = ap.id_input
      WHERE ap.status = TRUE AND ap.status_account = 'PENDIENTE' AND ap.voided_at IS NULL AND ap.superseded_by IS NULL
      AND i.status = 'ACTIVE' AND i.voided_at IS NULL
      ${branchIds ? branchIds.length ? 'AND i.id_sucursal IN (:allowed_branches)' : 'AND FALSE' : ''}
      ${q.id_sucursales?.length ? 'AND i.id_sucursal IN (:id_sucursales)' : ''}
      ${q.id_storages?.length ? 'AND i.id_storage IN (:id_storages)' : ''}
      GROUP BY ap.id_provider),
    ${exportMetrics}
    filtered AS (SELECT p.*, jsonb_build_object('code', t.code, 'name', t.name) type,
      jsonb_build_object('name', s.name) sector, jsonb_build_object('name', cat.name) category,
      l.date_voucher date_last_input, l.old_customer latest_old_customer, l.with_pickup latest_with_pickup,
      COALESCE(a.total_inputs, 0) total_inputs, COALESCE(a.total_amount, 0) total_amount,
      COALESCE(qj.total_kg, 0) total_products, COALESCE(qj.quantities, '[]'::jsonb) quantities,
      COALESCE(bal.balance, 0) saldo_cuentas_por_pagar, f.average_days, ${frequency} calculated_frequency ${exportFields}
      FROM providers p LEFT JOIN provider_companies c ON c.id = p.id_provider_company
      LEFT JOIN types_provider t ON t.id = p.id_type_provider LEFT JOIN sectors s ON s.id = p.id_sector LEFT JOIN categories cat ON cat.id = p.id_category
      LEFT JOIN amounts a ON a.id_provider = p.id LEFT JOIN latest l ON l.id_provider = p.id
      LEFT JOIN quantities_json qj ON qj.id_provider = p.id LEFT JOIN balances bal ON bal.id_provider = p.id LEFT JOIN frequency_stats f ON f.id_provider = p.id
      ${unpaginated && purchaseDetails ? 'LEFT JOIN export_metrics em ON em.id_provider = p.id' : ''}
      ${provider.length ? `WHERE ${provider.join(' AND ')}` : ''})`;
  const sql = `${ctes}
    SELECT (SELECT COUNT(*) FROM filtered) total,
      COALESCE((SELECT jsonb_agg(rows) FROM (SELECT * FROM filtered ORDER BY ${sorts[q.field_sort] || 'id'} ${order} NULLS LAST, id DESC ${unpaginated ? '' : 'LIMIT :limit OFFSET :offset'}) rows), '[]'::jsonb) data`;
  return { sql, replacements, ctes };
}

function buildPurchaseDetailQuery(q, branches = null, { providerManagement = false } = {}) {
  const replacements = {};
  const purchaseFilters = ["i.status = 'ACTIVE'", 'i.voided_at IS NULL', 'd.status = \'ACTIVE\'', 'd.removed_at IS NULL', 'pr.status = TRUE'];
  const addIn = (column, key, values) => {
    if (values?.length) {
      purchaseFilters.push(`${column} IN (:${key})`);
      replacements[key] = values;
    }
  };
  if (branches) addIn('i.id_sucursal', 'allowed_branches', branches);
  else if (branches !== null) purchaseFilters.push('FALSE');
  addIn('i.id_sucursal', 'id_sucursales', q.id_sucursales);
  addIn('i.id_storage', 'id_storages', q.id_storages);
  addIn('d.id_product', 'id_products', q.id_products);
  addIn('pr.id_category', 'id_categories', q.id_categories);
  if (q.start && q.date_basis === 'PURCHASES') {
    purchaseFilters.push('i.date_voucher >= :start::timestamptz AND i.date_voucher < :end::timestamptz');
    replacements.start = q.start;
    replacements.end = q.end;
  }
  for (const [key, column] of [['type_registry', 'i.type_registry'], ['payment_type', 'i.type'], ['purchase_referral_sources', 'i.referral_sources']]) {
    if (present(q[key])) {
      purchaseFilters.push(`${column} = :${key}`);
      replacements[key] = q[key];
    }
  }
  for (const [key, column] of [['purchase_old_customer', 'i.old_customer'], ['purchase_with_pickup', 'i.with_pickup']]) {
    if (q[key] !== undefined) {
      purchaseFilters.push(`${column} = :${key}`);
      replacements[key] = q[key];
    }
  }
  if (q.purchase_search) {
    const column = q.purchase_search_type === 'registry_number' ? 'i.registry_number' : 'i.cod';
    purchaseFilters.push(`${column} ILIKE :purchase_search`);
    replacements.purchase_search = `%${q.purchase_search}%`;
  }
  if (q.id_provider) {
    purchaseFilters.push('i.id_provider = :id_provider');
    replacements.id_provider = q.id_provider;
  }
  if (q.id_type_provider) {
    purchaseFilters.push('p.id_type_provider = :id_type_provider');
    replacements.id_type_provider = q.id_type_provider;
  }
  if (q.query && q.type === 'full_names') {
    purchaseFilters.push('p.full_names ILIKE :provider_query');
    replacements.provider_query = `%${q.query}%`;
  }
  let providerContext = '';
  if (providerManagement) {
    const scoped = buildQuery(q, branches);
    providerContext = scoped.ctes;
    Object.assign(replacements, scoped.replacements);
    purchaseFilters.push('i.id_provider IN (SELECT id FROM filtered)');
  }
  const sql = `${providerContext}
    SELECT i.id_sucursal, i.id_storage, d.id_product, i.id_provider,
      COALESCE(s.name, 'SIN SUCURSAL') AS branch, COALESCE(st.name, 'SIN ALMACÉN') AS storage,
      pr.cod AS code, pr.name AS product, COALESCE(cat.name, 'SIN CATEGORÍA') AS category,
      COALESCE(u.siglas, '') AS unit, p.full_names AS provider,
      CONCAT_WS(' - ', NULLIF(tp.code, ''), NULLIF(tp.name, '')) AS provider_type,
      COUNT(DISTINCT i.id) AS purchase_count, SUM(d.quantity) AS quantity, SUM(COALESCE(d.total, d.quantity * d.cost, 0)) AS amount
    FROM inputs i
    JOIN details_inputs d ON d.id_input = i.id
    JOIN products pr ON pr.id = d.id_product
    LEFT JOIN providers p ON p.id = i.id_provider
    LEFT JOIN types_provider tp ON tp.id = p.id_type_provider
    LEFT JOIN categories cat ON cat.id = pr.id_category
    LEFT JOIN units u ON u.id = pr.id_unit
    LEFT JOIN sucursals s ON s.id = i.id_sucursal
    LEFT JOIN storages st ON st.id = i.id_storage
    WHERE ${purchaseFilters.join(' AND ')}
    GROUP BY i.id_sucursal, i.id_storage, d.id_product, i.id_provider,
      s.name, st.name, pr.cod, pr.name, cat.name, u.siglas, p.full_names, tp.code, tp.name
    ORDER BY s.name, st.name, cat.name, pr.cod, p.full_names, i.id_provider`;
  return { sql, replacements };
}

module.exports = { normalizeQuery, buildQuery, buildPurchaseDetailQuery };

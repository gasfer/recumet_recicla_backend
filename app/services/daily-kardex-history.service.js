const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/config');

const ALLOWED_SORT_FIELDS = Object.freeze({
  date: 'm.date',
  id: 'm.id',
  registry_number: 'm.registry_number',
  detail: 'm.detail',
  quantity_input: "CASE WHEN m.type = 'INPUT' THEN m.quantity ELSE 0 END",
  quantity_output: "CASE WHEN m.type = 'OUTPUT' THEN m.quantity ELSE 0 END",
  'product.cod': 'p.cod',
  'product.name': 'p.name',
});

const resolveDayRange = (date) => {
  const [day, month, year] = String(date || '').split('-');
  if (!day || !month || !year) return null;
  const start = new Date(`${year}-${month}-${day}T00:00:00`);
  const end = new Date(`${year}-${month}-${day}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
};

const branchFilter = ({ idSucursal, idStorage, idProduct }, { sucursal, storage, product }) => {
  const parts = [];
  if (idSucursal != null && idSucursal !== '') parts.push(`${sucursal} = :idSucursal`);
  if (idStorage != null && idStorage !== '') parts.push(`${storage} = :idStorage`);
  if (idProduct) parts.push(`${product} = :idProduct`);
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
};

const dailyMovementSource = ({ idSucursal, idStorage, idProduct, type }) => {
  const scope = { idSucursal, idStorage, idProduct };
  const wants = (direction) => !type || type === direction;
  const branches = [];

  branches.push(`SELECT km.id, km.id AS id_movement, km.type, km.date, 'KMOVEMENT' AS type_movement, km.registry_number,
      km.details AS detail, km.details AS sub_detail, km.id_product, km.id_sucursal, km.id_storage, km.quantity, km.cost AS cost_unitario
    FROM kardex_movements km
    WHERE km.status = true AND km.date BETWEEN :start AND :end AND (:type = '' OR km.type = :type)${branchFilter(scope, { sucursal: 'km.id_sucursal', storage: 'km.id_storage', product: 'km.id_product' })}`);

  if (wants('INPUT')) {
    branches.push(`SELECT di.id, i.id AS id_movement, 'INPUT', i.date_voucher, 'INPUT', i.registry_number,
      COALESCE(pr.number_document, '0') || ' - ' || COALESCE(pr.full_names, 'SIN PROVEEDOR'), 'COMPRA #' || i.cod, di.id_product, i.id_sucursal, i.id_storage, di.quantity, di.cost
    FROM details_inputs di JOIN inputs i ON i.id = di.id_input LEFT JOIN providers pr ON pr.id = i.id_provider
    WHERE i.status = 'ACTIVE' AND i.date_voucher BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'i.id_sucursal', storage: 'i.id_storage', product: 'di.id_product' })}`);
    branches.push(`SELECT dt.id, tr.id AS id_movement, 'INPUT', tr.date_received, 'TRANSFER', '-',
      ss.name, 'TRASPASO RECIBIDO #' || tr.cod, dt.id_product, tr.id_sucursal_received, tr.id_storage_received,
      LEAST(COALESCE(dt.quantity_received, dt.quantity), dt.quantity), dt.cost
    FROM details_transfers dt JOIN transfers tr ON tr.id = dt.id_transfer JOIN sucursals ss ON ss.id = tr.id_sucursal_send
    WHERE tr.status = 'RECEIVED' AND tr.date_received BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'tr.id_sucursal_received', storage: 'tr.id_storage_received', product: 'dt.id_product' })}`);
    branches.push(`SELECT dc.id, cl.id AS id_movement, 'INPUT', cl.date_classified, 'CLASIFIED', cl.number_registry,
      p.name, 'A PARTIR DE CLASIFICADO #' || cl.cod, dc.id_product, cl.id_sucursal, cl.id_storage, dc.quantity, dc.cost
    FROM details_classifieds dc JOIN classifieds cl ON cl.id = dc.id_classified JOIN products p ON p.id = cl.id_product
    WHERE cl.status = 'ACTIVE' AND cl.date_classified BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'cl.id_sucursal', storage: 'cl.id_storage', product: 'dc.id_product' })}`);
  }

  if (wants('OUTPUT')) {
    branches.push(`SELECT do_.id, o.id AS id_movement, 'OUTPUT', o.date_output, 'OUTPUT', o.number_registry,
      COALESCE(c.number_document, '0') || ' - ' || COALESCE(c.full_names, 'SIN CLIENTE'), 'VENTA #' || o.cod, do_.id_product, o.id_sucursal, o.id_storage, do_.quantity, do_.cost
    FROM details_outputs do_ JOIN outputs o ON o.id = do_.id_output LEFT JOIN clients c ON c.id = o.id_client
    WHERE o.status = 'ACTIVE' AND o.date_output BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'o.id_sucursal', storage: 'o.id_storage', product: 'do_.id_product' })}`);
    branches.push(`SELECT dt.id, tr.id AS id_movement, 'OUTPUT', tr.date_send, 'TRANSFER', '-',
      sr.name, 'TRASPASO ENVIADO #' || tr.cod, dt.id_product, tr.id_sucursal_send, tr.id_storage_send, dt.quantity, dt.cost
    FROM details_transfers dt JOIN transfers tr ON tr.id = dt.id_transfer JOIN sucursals sr ON sr.id = tr.id_sucursal_received
    WHERE tr.status IN ('PENDING', 'RECEIVED') AND tr.date_send BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'tr.id_sucursal_send', storage: 'tr.id_storage_send', product: 'dt.id_product' })}`);
    branches.push(`SELECT cl.id, cl.id AS id_movement, 'OUTPUT', cl.date_classified, 'CLASIFIED', cl.number_registry,
      'CLASIFICADO', 'CLASIFICADO #' || cl.cod, cl.id_product, cl.id_sucursal, cl.id_storage, cl.quantity_product, cl.cost_product
    FROM classifieds cl WHERE cl.status = 'ACTIVE' AND cl.date_classified BETWEEN :start AND :end${branchFilter(scope, { sucursal: 'cl.id_sucursal', storage: 'cl.id_storage', product: 'cl.id_product' })}`);
  }

  return branches.join('\nUNION ALL\n');
};

const buildSearchCondition = (query) => (query
  ? '(m.registry_number ILIKE :query OR m.detail ILIKE :query OR m.sub_detail ILIKE :query OR p.cod ILIKE :query OR p.name ILIKE :query)'
  : '');

const buildReplacements = ({ idSucursal, idStorage, idProduct, type, query, range }) => {
  const base = {
    start: range.start,
    end: range.end,
    type: type || '',
    idProduct: idProduct || null,
  };
  if (idSucursal != null && idSucursal !== '') base.idSucursal = idSucursal;
  if (idStorage != null && idStorage !== '') base.idStorage = idStorage;
  if (query) base.query = `%${query}%`;
  return base;
};

const mapDailyRow = ({ total_count, ...row }) => ({
  ...row,
  quantity_input: row.type === 'INPUT' ? row.quantity : 0,
  quantity_output: row.type === 'OUTPUT' ? row.quantity : 0,
  saldo: null,
  saldo_inicial: null,
  cost_saldo: null,
  product: {
    cod: row.product_cod,
    name: row.product_name,
    unit: { siglas: row.unit_siglas || '' },
  },
  storage: { name: row.storage_name || '' },
  sucursal: { name: row.sucursal_name || '' },
});

const getDailyKardexHistory = async ({ date, idSucursal, idStorage, idProduct, type, query, fieldSort, order, page = 1, limit = 50 }) => {
  const range = resolveDayRange(date);
  if (!range) return { data: [], total: 0 };

  const direction = String(order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const sortColumn = ALLOWED_SORT_FIELDS[fieldSort] || ALLOWED_SORT_FIELDS.date;
  const source = dailyMovementSource({ idSucursal, idStorage, idProduct, type });
  const searchCondition = buildSearchCondition(query);
  const outerWhere = searchCondition ? `WHERE ${searchCondition}` : '';
  const replacements = buildReplacements({ idSucursal, idStorage, idProduct, type, query, range });
  const dataReplacements = { ...replacements, limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };

  const projection = `
    SELECT m.id, m.id_movement, m.type, m.date, m.type_movement, m.registry_number, m.detail, m.sub_detail,
      m.id_product, m.id_sucursal, m.id_storage, m.quantity, m.cost_unitario,
      p.cod AS product_cod, p.name AS product_name, u.siglas AS unit_siglas,
      st.name AS storage_name, su.name AS sucursal_name,
      COUNT(*) OVER() AS total_count
    FROM (${source}) m
    JOIN products p ON p.id = m.id_product
    JOIN units u ON u.id = p.id_unit
    LEFT JOIN storages st ON st.id = m.id_storage
    LEFT JOIN sucursals su ON su.id = m.id_sucursal
    ${outerWhere}
    ORDER BY ${sortColumn} ${direction}, m.id ${direction}
    LIMIT :limit OFFSET :offset`;

  const rows = await sequelize.query(projection, { replacements: dataReplacements, type: QueryTypes.SELECT });

  if (rows.length > 0) {
    return { data: rows.map(mapDailyRow), total: Number(rows[0].total_count) };
  }

  if (Number(page) > 1) {
    const countJoin = searchCondition ? 'JOIN products p ON p.id = m.id_product' : '';
    const [countRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM (${source}) m ${countJoin} ${outerWhere}`,
      { replacements, type: QueryTypes.SELECT }
    );
    return { data: [], total: countRow?.total || 0 };
  }

  return { data: [], total: 0 };
};

module.exports = { getDailyKardexHistory };
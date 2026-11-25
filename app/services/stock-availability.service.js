'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize, Stock, Product } = require('../database/config');
const { exactAdd, exactSubtract, exactCompare, exactAbs } = require('../helpers/number-formatter');

const availabilityKey = (productId, sucursalId, storageId) => (
  `${productId ?? ''}:${sucursalId ?? ''}:${storageId ?? ''}`
);

const attachAvailabilityToKardexRows = async (rows = [], context = {}) => {
  await Promise.all(rows.map(async (row) => {
    const values = row.dataValues || row;
    const availability = await getStockAvailability({
      id_product: values.id_product,
      id_sucursal: values.id_sucursal ?? context.idSucursal,
      id_storage: values.id_storage ?? context.idStorage,
      stock: values.quantity_saldo || 0,
    }, context.transaction);
    values.physical_stock = availability.physical_stock;
    values.stock_in_review = availability.stock_in_review;
    values.available_stock = availability.available_stock;
  }));
  return rows;
};

const getStockAvailability = async (stock, transaction) => {
  if (!stock) return { physical_stock: 0, stock_in_review: 0, available_stock: 0 };
  const physicalStock = exactAdd(stock.stock ?? stock.physical_stock ?? 0, 0);
  const [hold = {}] = await sequelize.query(`
    SELECT COALESCE(SUM(quantity), 0) AS quantity_in_review
    FROM transfer_review_inventory_holds
    WHERE id_product = :productId
      AND id_sucursal = :sucursalId
      AND id_storage = :storageId
      AND disposition <> 'LIBERADO_POR_AJUSTE'
  `, {
    replacements: {
      productId: stock.id_product ?? stock.idProduct,
      sucursalId: stock.id_sucursal ?? stock.idSucursal,
      storageId: stock.id_storage ?? stock.idStorage,
    },
    type: QueryTypes.SELECT,
    transaction,
  });
  const held = exactAdd(hold.quantity_in_review ?? 0, 0);
  return {
    physical_stock: physicalStock,
    stock_in_review: held,
    available_stock: exactCompare(physicalStock, held) < 0 ? '0.0000' : exactSubtract(physicalStock, held),
  };
};

const attachAvailabilityToStocks = async (stocks = [], transaction) => {
  await Promise.all(stocks.map(async (stock) => {
    const availability = await getStockAvailability(stock, transaction);
    stock.dataValues.physical_stock = availability.physical_stock;
    stock.dataValues.stock_in_review = availability.stock_in_review;
    stock.dataValues.available_stock = availability.available_stock;
  }));
  return stocks;
};

const hasAvailableStock = async (stock, requestedQuantity, transaction) => {
  const availability = await getStockAvailability(stock, transaction);
  return { ...availability, sufficient: exactCompare(availability.available_stock, requestedQuantity) >= 0 };
};

const validateOutgoingDetails = async ({ details = [], idSucursal, idStorage, transaction } = {}) => {
  const requestedByProduct = new Map();
  for (const detail of details) {
    const productId = Number(detail.id_product);
    requestedByProduct.set(productId, exactAdd(requestedByProduct.get(productId) || 0, detail.quantity || 0));
  }

  const productIds = [...requestedByProduct.keys()].sort((a, b) => a - b);
  if (!productIds.length) return [];

  // Lock active rows in a stable order and validate the whole document,
  // including repeated lines for the same product and legacy duplicate rows.
  const stockRows = await Stock.findAll({
    where: { id_product: productIds, id_sucursal: idSucursal, id_storage: idStorage, status: true },
    order: [['id_product', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  });
  const stockByProduct = new Map();
  for (const stock of stockRows) {
    const productId = Number(stock.id_product);
    const total = exactAdd(stockByProduct.get(productId)?.stock || 0, stock.stock || 0);
    stockByProduct.set(productId, { stock: total, id_product: productId, id_sucursal: idSucursal, id_storage: idStorage });
  }

  const products = await Product.findAll({ where: { id: productIds }, attributes: ['id', 'cod', 'name'], transaction });
  const productById = new Map(products.map((product) => [Number(product.id), product]));
  const errors = [];
  for (const productId of productIds) {
    const product = productById.get(productId);
    const stock = stockByProduct.get(productId);
    const label = product ? `${product.cod} - ${product.name}` : `Producto ${productId}`;
    const requested = requestedByProduct.get(productId);
    if (exactCompare(requested, 0) <= 0) {
      errors.push({ msg: `${label}: la cantidad total solicitada debe ser mayor a cero.` });
      continue;
    }
    if (!stock) {
      errors.push({ msg: `${label}: no tiene stock activo en la sucursal ${idSucursal} y almacén ${idStorage}.` });
      continue;
    }
    const availability = await hasAvailableStock(stock, requested, transaction);
    if (!availability.sufficient) {
      errors.push({ msg: `${label}: solicita ${requested} en total, pero hay ${availability.available_stock} disponibles.` });
    }
  }
  return errors;
};

const getStockDiagnostic = async ({ idSucursal, idStorage, limit = 500, onlyDifferences = false } = {}) => {
  // 1. Diagnóstico de desfase stock vs Kardex
  const rows = await sequelize.query(`
    WITH kardex_current AS (
      SELECT
        id_product,
        id_sucursal,
        id_storage,
        COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_balance,
        MAX(id) AS kardex_last_id,
        MAX(date) AS kardex_last_date
      FROM view_kardex_detalle
      WHERE date <= CURRENT_TIMESTAMP
        ${idSucursal ? 'AND id_sucursal = :idSucursal' : ''}
        ${idStorage ? 'AND id_storage = :idStorage' : ''}
      GROUP BY id_product, id_sucursal, id_storage
    ), stock_current AS (
      SELECT
        id_product,
        id_sucursal,
        id_storage,
        COALESCE(SUM(stock), 0) AS physical_stock,
        MAX("updatedAt") AS stock_updated_at,
        COUNT(*)::integer AS active_stock_rows
      FROM stocks
      WHERE status = true
        ${idSucursal ? 'AND id_sucursal = :idSucursal' : ''}
        ${idStorage ? 'AND id_storage = :idStorage' : ''}
      GROUP BY id_product, id_sucursal, id_storage
    )
    SELECT p.cod, p.name, s.id_product, s.id_sucursal, s.id_storage,
      s.physical_stock,
      s.stock_updated_at,
      s.active_stock_rows,
      COALESCE(holds.quantity_in_review, 0) AS stock_in_review,
      0::numeric AS retained_without_adjustment,
      0::numeric AS legacy_stock_in_review,
      0::numeric AS hold_source_difference,
      GREATEST(0, s.physical_stock - COALESCE(holds.quantity_in_review, 0)) AS available_stock,
      COALESCE(k.kardex_balance, 0) AS kardex_balance,
      k.kardex_last_id,
      k.kardex_last_date,
      s.physical_stock - COALESCE(k.kardex_balance, 0) AS physical_kardex_difference
    FROM stock_current s
    INNER JOIN products p ON p.id = s.id_product
    LEFT JOIN kardex_current k ON k.id_product = s.id_product AND k.id_sucursal = s.id_sucursal AND k.id_storage = s.id_storage
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(h.quantity), 0) AS quantity_in_review
      FROM transfer_review_inventory_holds h
      WHERE h.id_product = s.id_product
        AND h.id_sucursal = s.id_sucursal
        AND h.id_storage = s.id_storage
        AND h.disposition <> 'LIBERADO_POR_AJUSTE'
    ) holds ON TRUE
    WHERE true
      ${onlyDifferences ? 'AND s.physical_stock <> COALESCE(k.kardex_balance, 0)' : ''}
    ORDER BY ABS(s.physical_stock - COALESCE(k.kardex_balance, 0)) DESC, p.cod ASC
    LIMIT :limit
  `, {
    replacements: { idSucursal, idStorage, limit: Math.min(Number(limit) || 500, 2000) },
    type: QueryTypes.SELECT,
  });

  if (!rows || rows.length === 0) return [];

  // 2. Obtener trazabilidad: traslados con diferencia de cantidad para los productos con desfase
  const productIds = rows.map(r => Number(r.id_product));
  const traceableTransfers = await sequelize.query(`
    SELECT
      dt.id_product,
      tr.id            AS transfer_id,
      tr.cod           AS transfer_cod,
      tr.status        AS transfer_status,
      tr.date_send,
      tr.date_received,
      tr.id_sucursal_send,
      tr.id_sucursal_received,
      tr.id_storage_send,
      tr.id_storage_received,
      dt.id            AS detail_id,
      dt.quantity      AS quantity_sent,
      dt.quantity_received,
      dt.quantity - COALESCE(dt.quantity_received, dt.quantity) AS quantity_difference,
      -- Nota de revisión vinculada al traslado para este producto
      trn.id           AS review_note_id,
      trn.registry_number AS review_note_registry,
      trn.type         AS review_note_type,
      trn.reconciliation_status AS review_note_status
      ,CASE WHEN trn.id IS NOT NULL THEN 'CONFIRMADA' ELSE 'CANDIDATA' END AS relation_confidence
    FROM details_transfers dt
    INNER JOIN transfers tr ON tr.id = dt.id_transfer
    LEFT JOIN transfer_review_notes trn
      ON trn.id_transfer = tr.id
      AND trn.id_product = dt.id_product
    WHERE dt.id_product IN (:productIds)
      AND tr.status IN ('PENDING', 'RECEIVED')
      AND dt.quantity_received IS NOT NULL
      AND ABS(dt.quantity - dt.quantity_received) > 0
      ${idSucursal ? 'AND tr.id_sucursal_received = :idSucursal' : ''}
      ${idStorage ? 'AND tr.id_storage_received = :idStorage' : ''}
    ORDER BY tr.date_send DESC
  `, {
    replacements: { productIds, idSucursal, idStorage },
    type: QueryTypes.SELECT,
  });

  // 3. Agrupar traslados trazables por id_product
  const traceMap = {};
  for (const row of traceableTransfers) {
    const key = availabilityKey(row.id_product, row.id_sucursal_received, row.id_storage_received);
    if (!traceMap[key]) traceMap[key] = [];
    // Evitar duplicar el mismo detalle
    const exists = traceMap[key].some(t => t.detail_id === row.detail_id);
    if (!exists) traceMap[key].push(row);
  }

  // 4. Adjuntar trazabilidad y metadatos diagnósticos extendidos a cada fila (§5.1)
  const now = new Date();
  return rows.map(row => {
    const difference = exactAdd(row.physical_kardex_difference, 0);
    const absDifference = exactAbs(difference);
    const candidates = traceMap[availabilityKey(row.id_product, row.id_sucursal, row.id_storage)] || [];

    // Calcular antigüedad desde la última actualización de Stock
    const stockUpdatedAt = row.stock_updated_at ? new Date(row.stock_updated_at) : null;
    const ageInDays = stockUpdatedAt ? Math.floor((now - stockUpdatedAt) / 86_400_000) : null;

    // Dirección explícita sin inferir cuál saldo es correcto (§5.1, Scenario: Dirección)
    const direction = exactCompare(difference, 0) > 0 ? 'STOCK_MAYOR_QUE_KARDEX' : 'KARDEX_MAYOR_QUE_STOCK';

    // Cada candidato preserva su relation_confidence: 'CANDIDATA' | 'CONFIRMADA'
    // Una relación CANDIDATA no autoriza corrección por sí sola (spec §5.1).
    const candidateDocuments = candidates.map(t => ({
      ...t,
      relation_confidence: t.relation_confidence || 'CANDIDATA',
    }));

    return {
      ...row,
      // Campos extendidos §5.1: dirección, magnitud, antigüedad, candidatos etiquetados
      direction,
      magnitude: absDifference,
      age_in_days: ageInDays,
      has_confirmed_relation: candidateDocuments.some(c => c.relation_confidence === 'CONFIRMADA'),
      candidate_document_count: candidateDocuments.length,
      traceable_transfers: candidateDocuments,
    };
  });
};

const normalizeStockKardexIrregularity = (row) => {
  const physicalStock = exactAdd(row.physical_stock, 0);
  const kardexBalance = exactAdd(row.kardex_balance, 0);
  const difference = exactAdd(row.physical_kardex_difference, 0);
  return {
    ...row,
    id_product: Number(row.id_product),
    id_sucursal: Number(row.id_sucursal),
    id_storage: Number(row.id_storage),
    physical_stock: physicalStock,
    stock_in_review: exactAdd(row.stock_in_review, 0),
    available_stock: exactAdd(row.available_stock, 0),
    kardex_balance: kardexBalance,
    physical_kardex_difference: difference,
    difference_direction: exactCompare(difference, 0) > 0 ? 'STOCK_GREATER_THAN_KARDEX' : 'KARDEX_GREATER_THAN_STOCK',
  };
};

const getStockKardexIrregularities = async (filters = {}) => {
  const diagnostic = await getStockDiagnostic({ ...filters, onlyDifferences: true });
  return diagnostic
    .filter((row) => exactCompare(row.physical_kardex_difference, 0) !== 0)
    .map(normalizeStockKardexIrregularity);
};

const getRetainedWithoutAdjustmentReport = async ({ idSucursal, idStorage, limit = 500 } = {}) => sequelize.query(`
  SELECT
    h.id,
    h.quantity,
    h.id_product,
    h.id_sucursal,
    h.id_storage,
    p.cod,
    p.name,
    n.registry_number,
    n.id_transfer,
    d.id AS detail_id,
    d.quantity_difference,
    d.quantity_resolved,
    h."updatedAt" AS retained_at
  FROM transfer_review_inventory_holds h
  INNER JOIN transfer_review_note_details d ON d.id = h.id_transfer_review_note_detail
  INNER JOIN transfer_review_notes n ON n.id = d.id_transfer_review_note
  INNER JOIN products p ON p.id = h.id_product
  WHERE h.disposition = 'RETENIDO_SIN_AJUSTE'
    ${idSucursal ? 'AND h.id_sucursal = :idSucursal' : ''}
    ${idStorage ? 'AND h.id_storage = :idStorage' : ''}
  ORDER BY h."updatedAt" ASC, h.id ASC
  LIMIT :limit
`, {
  replacements: { idSucursal, idStorage, limit: Math.min(Number(limit) || 500, 2000) },
  type: QueryTypes.SELECT,
});

const getReviewStockKardexDifferences = async ({ noteId, transaction }) => sequelize.query(`
  WITH latest AS (
    SELECT id_product, id_sucursal, id_storage,
      COALESCE(SUM(quantity_input),0) - COALESCE(SUM(quantity_output),0) AS saldo
    FROM view_kardex_detalle
    GROUP BY id_product, id_sucursal, id_storage
  ), affected AS (
    SELECT n.id_product, n.id_sucursal, n.id_storage
    FROM transfer_review_notes n
    WHERE n.id = :noteId
    UNION
    SELECT km.id_product, km.id_sucursal, km.id_storage
    FROM transfer_review_resolution_actions a
    INNER JOIN transfer_review_action_movements am ON am.id_transfer_review_resolution_action = a.id
    INNER JOIN kardex_movements km ON km.id = am.id_kardex_movement
    WHERE a.id_transfer_review_note = :noteId
    UNION
    SELECT
      NULLIF(e.metadata->>'id_product', '')::INTEGER,
      COALESCE(NULLIF(e.metadata->>'id_sucursal', '')::INTEGER, n.id_sucursal),
      COALESCE(NULLIF(e.metadata->>'id_storage', '')::INTEGER, n.id_storage)
    FROM transfer_review_events e
    INNER JOIN transfer_review_notes n ON n.id = e.id_transfer_review_note
    WHERE e.id_transfer_review_note = :noteId
      AND e.event_type = 'ACCION_MANUAL'
      AND NULLIF(e.metadata->>'id_product', '') IS NOT NULL
  )
  SELECT p.cod, p.name, s.id_product, s.id_sucursal, s.id_storage,
    s.stock AS physical_stock,
    l.saldo AS kardex_balance,
    s.stock - COALESCE(l.saldo, 0) AS difference
  FROM affected a
  INNER JOIN stocks s ON s.id_product = a.id_product
    AND s.id_sucursal = a.id_sucursal
    AND s.id_storage = a.id_storage
    AND s.status = true
  INNER JOIN products p ON p.id = s.id_product
  LEFT JOIN latest l ON l.id_product = s.id_product
    AND l.id_sucursal = s.id_sucursal
    AND l.id_storage = s.id_storage
  WHERE s.stock <> COALESCE(l.saldo, 0)
  ORDER BY p.cod
`, {
  replacements: { noteId },
  type: QueryTypes.SELECT,
  transaction,
});

const assertStockKardexIntegrity = (options) => require('./stock-kardex-integrity.service').getStockKardexIntegrity(options);

module.exports = {
  availabilityKey,
  getStockAvailability,
  attachAvailabilityToStocks,
  attachAvailabilityToKardexRows,
  hasAvailableStock,
  validateOutgoingDetails,
  getStockDiagnostic,
  getStockKardexIrregularities,
  normalizeStockKardexIrregularity,
  getReviewStockKardexDifferences,
  getRetainedWithoutAdjustmentReport,
  assertStockKardexIntegrity,
};

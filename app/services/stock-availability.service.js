'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../database/config');

const availabilityKey = (productId, sucursalId, storageId) => `${productId}:${sucursalId}:${storageId}`;

const activeHoldFilter = "h.disposition <> 'LIBERADO_POR_AJUSTE'";

const getReviewQuantities = async ({ productIds = [], idSucursal, idStorage, transaction } = {}) => {
  const normalizedProductIds = [...new Set(productIds.map(Number).filter(Boolean))];
  if (normalizedProductIds.length === 0) return new Map();
  const sucursalIds = String(idSucursal || '').split(',').map(Number).filter(Boolean);
  const storageIds = String(idStorage || '').split(',').map(Number).filter(Boolean);

  const rows = await sequelize.query(`
    SELECT
      h.id_product,
      h.id_sucursal,
      h.id_storage,
      COALESCE(SUM(h.quantity), 0) AS quantity_in_review
    FROM transfer_review_inventory_holds h
    WHERE ${activeHoldFilter}
      AND h.id_product IN (:productIds)
      ${sucursalIds.length > 0 ? 'AND h.id_sucursal IN (:sucursalIds)' : ''}
      ${storageIds.length > 0 ? 'AND h.id_storage IN (:storageIds)' : ''}
    GROUP BY h.id_product, h.id_sucursal, h.id_storage
  `, {
    replacements: {
      productIds: normalizedProductIds,
      sucursalIds,
      storageIds,
    },
    type: QueryTypes.SELECT,
    transaction,
  });

  return new Map(rows.map((row) => [
    availabilityKey(row.id_product, row.id_sucursal, row.id_storage),
    Number(row.quantity_in_review),
  ]));
};

const getReviewQuantitiesByProduct = async ({ productIds = [], idSucursal, idStorage, transaction } = {}) => {
  const byLocation = await getReviewQuantities({ productIds, idSucursal, idStorage, transaction });
  const totals = new Map();
  for (const [key, quantity] of byLocation.entries()) {
    const productId = Number(key.split(':')[0]);
    totals.set(productId, (totals.get(productId) || 0) + Number(quantity));
  }
  return totals;
};

const attachAvailabilityToKardexRows = async (rows = [], context = {}) => {
  const quantities = await getReviewQuantitiesByProduct({
    productIds: rows.map(({ id_product }) => id_product),
    idSucursal: context.idSucursal,
    idStorage: context.idStorage,
    transaction: context.transaction,
  });
  for (const row of rows) {
    const physicalStock = Number(row.dataValues.quantity_saldo || 0);
    const stockInReview = quantities.get(Number(row.id_product)) || 0;
    row.dataValues.physical_stock = physicalStock;
    row.dataValues.stock_in_review = stockInReview;
    row.dataValues.available_stock = Math.max(0, physicalStock - stockInReview);
  }
  return rows;
};

const getStockAvailability = async (stock, transaction) => {
  if (!stock) return { physical_stock: 0, stock_in_review: 0, available_stock: 0 };
  const quantities = await getReviewQuantities({
    productIds: [stock.id_product],
    idSucursal: stock.id_sucursal,
    idStorage: stock.id_storage,
    transaction,
  });
  const physicalStock = Number(stock.stock);
  const stockInReview = quantities.get(availabilityKey(stock.id_product, stock.id_sucursal, stock.id_storage)) || 0;
  return {
    physical_stock: physicalStock,
    stock_in_review: stockInReview,
    available_stock: Math.max(0, physicalStock - stockInReview),
  };
};

const attachAvailabilityToStocks = async (stocks = [], transaction) => {
  const quantities = await getReviewQuantities({
    productIds: stocks.map(({ id_product }) => id_product),
    transaction,
  });
  for (const stock of stocks) {
    const physicalStock = Number(stock.stock);
    const stockInReview = quantities.get(availabilityKey(stock.id_product, stock.id_sucursal, stock.id_storage)) || 0;
    stock.dataValues.physical_stock = physicalStock;
    stock.dataValues.stock_in_review = stockInReview;
    stock.dataValues.available_stock = Math.max(0, physicalStock - stockInReview);
  }
  return stocks;
};

const hasAvailableStock = async (stock, requestedQuantity, transaction) => {
  const availability = await getStockAvailability(stock, transaction);
  return { ...availability, sufficient: availability.available_stock >= Number(requestedQuantity) };
};

const getStockDiagnostic = async ({ idSucursal, idStorage, limit = 500 } = {}) => {
  // 1. Diagnóstico de desfase stock vs Kardex
  const rows = await sequelize.query(`
    WITH latest AS (
      SELECT DISTINCT ON (id_product, id_sucursal, id_storage)
        id_product, id_sucursal, id_storage, saldo
      FROM view_kardex_detalle
      ORDER BY id_product, id_sucursal, id_storage, date DESC, id DESC
    ), held AS (
      SELECT h.id_product, h.id_sucursal, h.id_storage,
        SUM(h.quantity) AS quantity_in_review,
        SUM(h.quantity) FILTER (WHERE h.disposition = 'RETENIDO_SIN_AJUSTE') AS retained_without_adjustment
      FROM transfer_review_inventory_holds h
      WHERE ${activeHoldFilter}
      GROUP BY h.id_product, h.id_sucursal, h.id_storage
    ), legacy_held AS (
      SELECT n.id_product, n.id_sucursal, n.id_storage,
        SUM(GREATEST(d.quantity_difference - d.quantity_resolved, 0)) AS quantity_in_review
      FROM transfer_review_notes n
      INNER JOIN transfer_review_note_details d ON d.id_transfer_review_note = n.id
      WHERE n.reconciliation_status <> 'COMPLETADO'
        AND d.reconciliation_status <> 'COMPLETADO'
      GROUP BY n.id_product, n.id_sucursal, n.id_storage
    )
    SELECT p.cod, p.name, s.id_product, s.id_sucursal, s.id_storage,
      s.stock AS physical_stock,
      COALESCE(h.quantity_in_review, 0) AS stock_in_review,
      COALESCE(h.retained_without_adjustment, 0) AS retained_without_adjustment,
      COALESCE(lh.quantity_in_review, 0) AS legacy_stock_in_review,
      COALESCE(h.quantity_in_review, 0) - COALESCE(lh.quantity_in_review, 0) AS hold_source_difference,
      GREATEST(s.stock - COALESCE(h.quantity_in_review, 0), 0) AS available_stock,
      COALESCE(l.saldo, 0) AS kardex_balance,
      s.stock - COALESCE(l.saldo, 0) AS physical_kardex_difference
    FROM stocks s
    INNER JOIN products p ON p.id = s.id_product
    LEFT JOIN held h ON h.id_product = s.id_product AND h.id_sucursal = s.id_sucursal AND h.id_storage = s.id_storage
    LEFT JOIN legacy_held lh ON lh.id_product = s.id_product AND lh.id_sucursal = s.id_sucursal AND lh.id_storage = s.id_storage
    LEFT JOIN latest l ON l.id_product = s.id_product AND l.id_sucursal = s.id_sucursal AND l.id_storage = s.id_storage
    WHERE s.status = true
      ${idSucursal ? 'AND s.id_sucursal = :idSucursal' : ''}
      ${idStorage ? 'AND s.id_storage = :idStorage' : ''}
    ORDER BY ABS(s.stock - COALESCE(l.saldo, 0)) DESC, p.cod ASC
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
    FROM details_transfers dt
    INNER JOIN transfers tr ON tr.id = dt.id_transfer
    LEFT JOIN transfer_review_notes trn
      ON trn.id_transfer = tr.id
      AND trn.id_product = dt.id_product
    WHERE dt.id_product IN (:productIds)
      AND tr.status IN ('PENDING', 'RECEIVED')
      AND (
        dt.quantity_received IS NULL
        OR ABS(dt.quantity - dt.quantity_received) > 0.0001
      )
    ORDER BY tr.date_send DESC
  `, {
    replacements: { productIds },
    type: QueryTypes.SELECT,
  });

  // 3. Agrupar traslados trazables por id_product
  const traceMap = {};
  for (const row of traceableTransfers) {
    const key = Number(row.id_product);
    if (!traceMap[key]) traceMap[key] = [];
    // Evitar duplicar el mismo detalle
    const exists = traceMap[key].some(t => t.detail_id === row.detail_id);
    if (!exists) traceMap[key].push(row);
  }

  // 4. Adjuntar trazabilidad a cada fila del diagnóstico
  return rows.map(row => ({
    ...row,
    traceable_transfers: traceMap[Number(row.id_product)] || [],
  }));
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

// Corrige stocks.stock usando el último saldo de view_kardex_detalle como fuente canónica.
// Retorna la lista de productos corregidos con valores anterior y nuevo.
const syncStocksFromKardex = async ({ idSucursal, idStorage } = {}) => {
  const diagnostic = await getStockDiagnostic({ idSucursal, idStorage, limit: 2000 });
  const toSync = diagnostic.filter(row => Math.abs(Number(row.physical_kardex_difference)) > 0.0001);

  if (toSync.length === 0) return [];

  const t = await sequelize.transaction();
  try {
    const corrected = [];
    for (const row of toSync) {
      const newStock = Number(row.kardex_balance);
      await sequelize.query(
        `UPDATE stocks SET stock = :newStock, "updatedAt" = NOW()
         WHERE id_product = :id_product AND id_sucursal = :id_sucursal AND id_storage = :id_storage AND status = true`,
        {
          replacements: {
            newStock,
            id_product: row.id_product,
            id_sucursal: row.id_sucursal,
            id_storage: row.id_storage,
          },
          type: QueryTypes.UPDATE,
          transaction: t,
        }
      );
      corrected.push({
        id_product: row.id_product,
        cod: row.cod,
        name: row.name,
        id_sucursal: row.id_sucursal,
        id_storage: row.id_storage,
        old_stock: Number(row.physical_stock),
        new_stock: newStock,
        difference: Number(row.physical_kardex_difference),
      });
    }
    await t.commit();
    return corrected;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

const getReviewStockKardexDifferences = async ({ noteId, transaction }) => sequelize.query(`
  WITH latest AS (
    SELECT DISTINCT ON (id_product, id_sucursal, id_storage)
      id_product, id_sucursal, id_storage, saldo
    FROM view_kardex_detalle
    ORDER BY id_product, id_sucursal, id_storage, date DESC, id DESC
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
  WHERE ABS(s.stock - COALESCE(l.saldo, 0)) > 0.0001
  ORDER BY p.cod
`, {
  replacements: { noteId },
  type: QueryTypes.SELECT,
  transaction,
});

module.exports = {
  availabilityKey,
  getReviewQuantities,
  getReviewQuantitiesByProduct,
  getStockAvailability,
  attachAvailabilityToStocks,
  attachAvailabilityToKardexRows,
  hasAvailableStock,
  getStockDiagnostic,
  getReviewStockKardexDifferences,
  getRetainedWithoutAdjustmentReport,
  syncStocksFromKardex,
};

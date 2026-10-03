'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize, Stock } = require('../database/config');
const { exactAdd, exactSubtract, exactCompare } = require('../helpers/number-formatter');

const getDefaultTolerance = () => 0;

const normalizeLocation = ({ productId, sucursalId, storageId }) => ({
  productId: Number(productId),
  sucursalId: Number(sucursalId),
  storageId: Number(storageId),
});

const locationKey = (location) => {
  const normalized = normalizeLocation(location);
  return `${normalized.productId}:${normalized.sucursalId}:${normalized.storageId}`;
};

const uniqueSortedLocations = (locations = []) => Array.from(
  new Map(locations.map((location) => [locationKey(location), normalizeLocation(location)])).values(),
).sort((first, second) => locationKey(first).localeCompare(locationKey(second)));

const getStockKardexIntegrity = async ({ productId, sucursalId, storageId, transaction, tolerance = getDefaultTolerance() } = {}) => {
  const location = normalizeLocation({ productId, sucursalId, storageId });
  const stock = await Stock.findOne({
    where: {
      id_product: location.productId,
      id_sucursal: location.sucursalId,
      id_storage: location.storageId,
      status: true,
    },
    transaction,
  });
  const physicalStock = exactAdd(stock?.stock ?? 0, 0);
  const [projection = {}] = await sequelize.query(`
    WITH detail AS (
      SELECT quantity_input, quantity_output
      FROM view_kardex_detalle
      WHERE id_product = :productId AND id_sucursal = :sucursalId AND id_storage = :storageId
    ), physical AS (
      SELECT id_product, id_sucursal, id_storage,
        COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS quantity_saldo
      FROM view_kardex_detalle
      WHERE id_product = :productId AND id_sucursal = :sucursalId AND id_storage = :storageId
      GROUP BY id_product, id_sucursal, id_storage
    ), duplicates AS (
      SELECT source_type, source_id, source_detail_id, effect_type
      FROM kardex_movements
      WHERE status = true AND source_type IS NOT NULL AND source_id IS NOT NULL
        AND source_detail_id IS NOT NULL AND effect_type IS NOT NULL
        AND (source_type,source_id,source_detail_id,effect_type) IN (
          SELECT source_type,source_id,source_detail_id,effect_type FROM kardex_movements
          WHERE status = true AND id_product = :productId AND id_sucursal = :sucursalId AND id_storage = :storageId
        )
      GROUP BY source_type, source_id, source_detail_id, effect_type HAVING COUNT(*) > 1
    )
    SELECT (SELECT COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) FROM detail) AS kardex_balance,
      COALESCE((SELECT quantity_saldo FROM physical), 0) AS physical_kardex_balance,
      (SELECT COUNT(*)::integer FROM duplicates) AS duplicate_effects,
      (SELECT COALESCE(SUM(quantity),0) FROM transfer_review_inventory_holds
        WHERE id_product=:productId AND id_sucursal=:sucursalId AND id_storage=:storageId
          AND disposition <> 'LIBERADO_POR_AJUSTE') AS held_quantity
  `, {
    replacements: location,
    type: QueryTypes.SELECT,
    transaction,
  });
  if (projection.kardex_balance == null || projection.physical_kardex_balance == null) {
    throw Object.assign(new Error('No se pudieron verificar ambas proyecciones Kardex.'), { statusCode: 409, code: 'KARDEX_PROJECTION_UNAVAILABLE' });
  }
  const kardexBalance = exactAdd(projection.kardex_balance, 0);
  const physicalKardexBalance = exactAdd(projection.physical_kardex_balance, 0);
  const difference = exactSubtract(physicalStock, kardexBalance);
  const physicalDifference = exactSubtract(physicalStock, physicalKardexBalance);
  const heldQuantity = exactAdd(projection.held_quantity ?? 0, 0);
  const availableQuantity = exactSubtract(physicalStock, heldQuantity);
  return {
    consistent: exactCompare(difference, 0) === 0 && exactCompare(physicalDifference, 0) === 0 && Number(projection.duplicate_effects) === 0 && exactCompare(physicalStock, 0) >= 0 && exactCompare(availableQuantity, 0) >= 0 && exactCompare(heldQuantity, 0) >= 0,
    ...location,
    physicalStock,
    kardexBalance,
    difference,
    physicalKardexBalance,
    physicalDifference,
    heldQuantity,
    availableQuantity,
    duplicateEffects: Number(projection.duplicate_effects),
    tolerance: 0,
  };
};

const parityError = (diagnostics) => Object.assign(
  new Error('La operación no puede confirmarse porque Stock y Kardex no terminan con el mismo saldo.'),
  {
    statusCode: 409,
    code: 'STOCK_KARDEX_PARITY_VIOLATION',
    details: diagnostics.map(({ productId, sucursalId, storageId, physicalStock, kardexBalance, difference, physicalKardexBalance, physicalDifference, duplicateEffects }) => ({
      product_id: productId,
      sucursal_id: sucursalId,
      storage_id: storageId,
      stock: physicalStock,
      kardex: kardexBalance,
      difference,
      physical_kardex: physicalKardexBalance,
      physical_difference: physicalDifference,
      duplicate_effects: duplicateEffects,
    })),
  },
);

const verifyStockKardexIntegrity = async (options = {}) => {
  const diagnostic = await getStockKardexIntegrity(options);
  if (!diagnostic.consistent) throw parityError([diagnostic]);
  return diagnostic;
};

const verifyLocationsIntegrity = async ({ locations, transaction, tolerance = getDefaultTolerance() }) => {
  const diagnostics = [];
  for (const location of uniqueSortedLocations(locations)) {
    diagnostics.push(await getStockKardexIntegrity({ ...location, transaction, tolerance }));
  }
  const inconsistent = diagnostics.filter((diagnostic) => !diagnostic.consistent);
  if (inconsistent.length) throw parityError(inconsistent);
  return diagnostics;
};

const verifyLocationsIntegrityPreserved = async ({ locations, transaction }) => verifyLocationsIntegrity({ locations, transaction });

module.exports = {
  getDefaultTolerance,
  normalizeLocation,
  locationKey,
  uniqueSortedLocations,
  getStockKardexIntegrity,
  assertStockKardexIntegrity: getStockKardexIntegrity,
  verifyStockKardexIntegrity,
  verifyLocationsIntegrity,
  verifyLocationsIntegrityPreserved,
};

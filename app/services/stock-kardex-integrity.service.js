'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize, Stock } = require('../database/config');
const { decimalSubtract, decimalTolerance } = require('../helpers/number-formatter');

const getDefaultTolerance = () => decimalTolerance();

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
  const physicalStock = stock ? Number(stock.stock) : 0;
  const [projection = {}] = await sequelize.query(`
    SELECT COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_balance
    FROM view_kardex_detalle
    WHERE id_product = :productId
      AND id_sucursal = :sucursalId
      AND id_storage = :storageId
  `, {
    replacements: location,
    type: QueryTypes.SELECT,
    transaction,
  });
  const kardexBalance = Number(projection.kardex_balance || 0);
  const difference = decimalSubtract(physicalStock, kardexBalance);
  return {
    consistent: Math.abs(difference) <= Number(tolerance),
    ...location,
    physicalStock,
    kardexBalance,
    difference,
    tolerance: Number(tolerance),
  };
};

const parityError = (diagnostics) => Object.assign(
  new Error('La operación no puede confirmarse porque Stock y Kardex no terminan con el mismo saldo.'),
  {
    statusCode: 409,
    code: 'STOCK_KARDEX_PARITY_VIOLATION',
    details: diagnostics.map(({ productId, sucursalId, storageId, physicalStock, kardexBalance, difference }) => ({
      product_id: productId,
      sucursal_id: sucursalId,
      storage_id: storageId,
      stock: physicalStock,
      kardex: kardexBalance,
      difference,
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

const verifyLocationsIntegrityPreserved = async ({ locations, beforeDiagnostics, transaction, tolerance = getDefaultTolerance() }) => {
  const beforeByLocation = new Map((beforeDiagnostics || []).map((diagnostic) => [locationKey(diagnostic), diagnostic]));
  const afterDiagnostics = [];
  const changed = [];
  for (const location of uniqueSortedLocations(locations)) {
    const after = await getStockKardexIntegrity({ ...location, transaction, tolerance });
    const before = beforeByLocation.get(locationKey(location));
    afterDiagnostics.push(after);
    if (!before || Math.abs(Number(after.difference) - Number(before.difference)) > Number(tolerance)) {
      changed.push({ ...after, previousDifference: before?.difference ?? null });
    }
  }
  if (changed.length) {
    const error = parityError(changed);
    error.message = 'La operación no puede confirmarse porque modificó la diferencia previa entre Stock y Kardex.';
    error.details = changed.map(({ productId, sucursalId, storageId, physicalStock, kardexBalance, difference, previousDifference }) => ({
      product_id: productId,
      sucursal_id: sucursalId,
      storage_id: storageId,
      stock: physicalStock,
      kardex: kardexBalance,
      previous_difference: previousDifference,
      difference,
    }));
    throw error;
  }
  return afterDiagnostics;
};

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

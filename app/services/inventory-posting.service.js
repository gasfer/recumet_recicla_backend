'use strict';

const { Stock, kardexMovements, sequelize } = require('../database/config');
const { uniqueSortedLocations } = require('./stock-kardex-integrity.service');
const { exactAdd, exactSubtract, exactCompare, inventoryQuantity } = require('../helpers/number-formatter');

const postingError = (message, statusCode = 422, details) => Object.assign(new Error(message), {
  statusCode,
  code: 'INVENTORY_POSTING_REJECTED',
  ...(details ? { details } : {}),
});

const validateQuantity = (quantity) => {
  let value;
  try { value = inventoryQuantity(quantity); } catch (_) { throw postingError('La cantidad del efecto de inventario no es válida.'); }
  if (exactCompare(value, 0) <= 0) throw postingError('La cantidad normalizada del efecto de inventario debe ser mayor a cero.');
  return value;
};
const validateEffectQuantity = (quantity) => {
  let value;
  try { value = exactAdd(quantity, 0); } catch (_) { throw postingError('La cantidad del efecto no es válida.'); }
  if (exactCompare(value, 0) <= 0) throw postingError('La cantidad del efecto debe ser mayor a cero.');
  return value;
};

const findOrCreateLockedStock = async ({ productId, sucursalId, storageId, transaction, createIfMissing = true }) => {
  const where = { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true };
  if (!transaction) throw postingError('El efecto de inventario requiere una transacción.', 409);
  // A row lock cannot protect an absent row. Serialize the location before
  // looking it up, avoiding an aborted transaction on concurrent INSERT.
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtextextended(:location, 0))', {
    replacements: { location: `stock:${productId}:${sucursalId}:${storageId}` }, transaction,
  });
  let stock = await Stock.findOne({
    where,
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  });
  if (!stock && createIfMissing) {
    try {
      stock = await Stock.create({ stock_min: 1, stock: 0, ...where }, { transaction });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      stock = await Stock.findOne({ where, transaction, lock: transaction?.LOCK?.UPDATE || true });
    }
  }
  if (!stock) throw postingError('No existe stock activo para el producto y almacén seleccionados.', 409, where);
  return stock;
};

const lockLocations = async ({ locations, transaction, createIfMissing = true }) => {
  const locked = [];
  for (const location of uniqueSortedLocations(locations)) {
    locked.push(await findOrCreateLockedStock({ ...location, transaction, createIfMissing }));
  }
  return locked;
};

const applyStockDelta = async ({ productId, sucursalId, storageId, delta, transaction, createIfMissing = true }) => {
  const stock = await findOrCreateLockedStock({ productId, sucursalId, storageId, transaction, createIfMissing });
  const before = exactAdd(stock.stock, 0);
  const after = exactAdd(before, delta);
  if (exactCompare(after, 0) < 0) throw postingError('El efecto dejaría Stock negativo.', 409, { productId, sucursalId, storageId, before, delta });
  stock.setDataValue('stock', after);
  await stock.save({ transaction });
  return { stock, before, after };
};

const applyDerivedStockEffect = async ({ productId, sucursalId, storageId, quantity, direction = 'INPUT', transaction }) => {
  const amount = validateEffectQuantity(quantity);
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw postingError('La dirección del efecto debe ser INPUT u OUTPUT.');
  const delta = direction === 'OUTPUT' ? exactSubtract(0, amount) : amount;
  return applyStockDelta({ productId, sucursalId, storageId, delta, transaction, createIfMissing: direction !== 'OUTPUT' });
};

const applyExplicitEffect = async ({
  productId, sucursalId, storageId, quantity, direction, actorUserId, date, details,
  registryNumber, cost = 0, sourceType, sourceId, sourceDetailId, effectType,
  idempotencyKey, heldAllowance = 0, transaction,
}) => {
  const amount = validateEffectQuantity(quantity);
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw postingError('La dirección del efecto debe ser INPUT u OUTPUT.');
  const stock = await findOrCreateLockedStock({ productId, sucursalId, storageId, transaction, createIfMissing: direction === 'INPUT' });
  const logicalWhere = sourceType && sourceId != null && sourceDetailId != null && effectType
    ? { source_type: sourceType, source_id: String(sourceId), source_detail_id: String(sourceDetailId), effect_type: effectType }
    : null;
  const existing = idempotencyKey ? await kardexMovements.findOne({ where: { idempotency_key: idempotencyKey }, transaction }) : null;
  const logicalExisting = existing || (logicalWhere ? await kardexMovements.findOne({ where: logicalWhere, transaction }) : null);
  if (logicalExisting) {
    if (logicalExisting.status === false) throw postingError('El efecto anterior fue revertido; requiere una operación autorizada nueva.', 409);
    if (logicalExisting.type !== direction || exactCompare(logicalExisting.quantity, amount) !== 0 || Number(logicalExisting.id_product) !== Number(productId) || Number(logicalExisting.id_sucursal) !== Number(sucursalId) || Number(logicalExisting.id_storage) !== Number(storageId)) {
      throw postingError('El reintento no coincide con el efecto de inventario registrado.', 409);
    }
    return { movement: logicalExisting, repeated: true, before: null, after: null };
  }
  const before = exactAdd(stock.stock, 0);
  if (direction === 'OUTPUT' && exactCompare(before, amount) < 0) {
    throw postingError('Stock insuficiente para aplicar el movimiento.', 409, { productId, sucursalId, storageId, available: before, quantity: amount });
  }
  const after = direction === 'OUTPUT' ? exactSubtract(before, amount) : exactAdd(before, amount);
  stock.setDataValue('stock', after);
  await stock.save({ transaction });
  const movement = await kardexMovements.create({
    type: direction,
    date,
    details,
    quantity: amount,
    cost,
    price: 0,
    total: 0,
    id_product: productId,
    id_user: actorUserId,
    id_sucursal: sucursalId,
    id_storage: storageId,
    status: true,
    registry_number: registryNumber,
    source_type: sourceType || null,
    source_id: sourceId || null,
    source_detail_id: sourceDetailId || null,
    effect_type: effectType || null,
    idempotency_key: idempotencyKey || null,
  }, { transaction });
  return { movement, repeated: false, before, after };
};

const registerKardexOnlyEffect = async ({
  productId, sucursalId, storageId, quantity, direction, actorUserId, date, details,
  registryNumber, cost = 0, sourceType, sourceId, sourceDetailId, effectType,
  idempotencyKey, transaction,
}) => {
  const amount = validateEffectQuantity(quantity);
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw postingError('La dirección del movimiento Kardex debe ser INPUT u OUTPUT.');
  await findOrCreateLockedStock({ productId, sucursalId, storageId, transaction });
  const byKey = idempotencyKey ? await kardexMovements.findOne({ where: { idempotency_key: idempotencyKey }, transaction }) : null;
  const existing = byKey || (sourceType && sourceId != null && sourceDetailId != null && effectType ? await kardexMovements.findOne({
    where: { source_type: sourceType, source_id: String(sourceId), source_detail_id: String(sourceDetailId), effect_type: effectType }, transaction,
  }) : null);
  if (existing) {
    if (existing.status === false) throw postingError('El movimiento anterior fue revertido; requiere una operación autorizada nueva.', 409);
    if (existing.type !== direction || exactCompare(existing.quantity, amount) !== 0 || Number(existing.id_product) !== Number(productId) || Number(existing.id_sucursal) !== Number(sucursalId) || Number(existing.id_storage) !== Number(storageId)) {
      throw postingError('El reintento no coincide con el movimiento Kardex registrado.', 409);
    }
    return { movement: existing, repeated: true };
  }
  const movement = await kardexMovements.create({
    type: direction, date, details, quantity: amount, cost, price: 0, total: 0,
    id_product: productId, id_user: actorUserId, id_sucursal: sucursalId, id_storage: storageId,
    status: true, registry_number: registryNumber, source_type: sourceType || null,
    source_id: sourceId || null, source_detail_id: sourceDetailId || null,
    effect_type: effectType || null, idempotency_key: idempotencyKey || null,
  }, { transaction });
  return { movement, repeated: false };
};

module.exports = {
  postingError,
  validateQuantity,
  findOrCreateLockedStock,
  lockLocations,
  applyStockDelta,
  applyDerivedStockEffect,
  applyExplicitEffect,
  registerKardexOnlyEffect,
};

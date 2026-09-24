'use strict';

const { Stock, kardexMovements } = require('../database/config');
const { uniqueSortedLocations } = require('./stock-kardex-integrity.service');

const postingError = (message, statusCode = 422, details) => Object.assign(new Error(message), {
  statusCode,
  code: 'INVENTORY_POSTING_REJECTED',
  ...(details ? { details } : {}),
});

const validateQuantity = (quantity) => {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) throw postingError('La cantidad del efecto de inventario debe ser mayor a cero.');
  return value;
};

const findOrCreateLockedStock = async ({ productId, sucursalId, storageId, transaction, createIfMissing = true }) => {
  const where = { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true };
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
  const before = Number(stock.stock);
  const after = Number((before + Number(delta)).toFixed(4));
  if (after < -0.0001) throw postingError('El efecto dejaría Stock negativo.', 409, { productId, sucursalId, storageId, before, delta });
  stock.stock = after;
  await stock.save({ transaction });
  return { stock, before, after };
};

const applyDerivedStockEffect = async ({ productId, sucursalId, storageId, quantity, direction = 'INPUT', transaction }) => {
  const amount = validateQuantity(quantity);
  const delta = direction === 'OUTPUT' ? -amount : amount;
  return applyStockDelta({ productId, sucursalId, storageId, delta, transaction, createIfMissing: direction !== 'OUTPUT' });
};

const applyExplicitEffect = async ({
  productId, sucursalId, storageId, quantity, direction, actorUserId, date, details,
  registryNumber, cost = 0, sourceType, sourceId, sourceDetailId, effectType,
  idempotencyKey, heldAllowance = 0, transaction,
}) => {
  const amount = validateQuantity(quantity);
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw postingError('La dirección del efecto debe ser INPUT u OUTPUT.');
  if (idempotencyKey) {
    const existing = await kardexMovements.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
    if (existing) return { movement: existing, repeated: true, before: null, after: null };
  }
  const stock = await findOrCreateLockedStock({ productId, sucursalId, storageId, transaction, createIfMissing: direction === 'INPUT' });
  const before = Number(stock.stock);
  if (direction === 'OUTPUT' && before + Number(heldAllowance || 0) + 0.0001 < amount) {
    throw postingError('Stock insuficiente para aplicar el movimiento.', 409, { productId, sucursalId, storageId, available: before, quantity: amount });
  }
  const after = Number((before + (direction === 'OUTPUT' ? -amount : amount)).toFixed(4));
  stock.stock = after;
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
  const amount = validateQuantity(quantity);
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw postingError('La dirección del movimiento Kardex debe ser INPUT u OUTPUT.');
  if (idempotencyKey) {
    const existing = await kardexMovements.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
    if (existing) return { movement: existing, repeated: true };
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

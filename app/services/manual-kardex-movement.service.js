'use strict';

const db = require('../database/config');
const { inventoryQuantity, exactCompare } = require('../helpers/number-formatter');
const inventoryPosting = require('./inventory-posting.service');
const availabilityService = require('./stock-availability.service');
const integrityService = require('./stock-kardex-integrity.service');

const movementError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const registerManualMovement = async ({ actorRole, actorUserId, idempotencyKey, idProduct, idSucursal, idStorage, direction, quantity, reason }, dependencies = {}) => {
  if (actorRole !== 'ADMINISTRADOR') throw movementError('Sólo un administrador puede registrar movimientos manuales.', 403);
  if (!idempotencyKey || String(idempotencyKey).length > 100) throw movementError('La clave de idempotencia es obligatoria.');
  if (!['INPUT', 'OUTPUT'].includes(direction)) throw movementError('Seleccione INGRESO o SALIDA.');
  let amount;
  try { amount = inventoryQuantity(quantity); } catch (_) { throw movementError('La cantidad debe ser numérica y mayor a cero.'); }
  if (exactCompare(amount, 0) <= 0) throw movementError('La cantidad debe ser mayor a cero.');
  const note = String(reason || '').trim();
  if (note.length < 10 || note.length > 500) throw movementError('El motivo debe tener entre 10 y 500 caracteres.');
  const productId = Number(idProduct);
  const sucursalId = Number(idSucursal);
  const storageId = Number(idStorage);
  if (![productId, sucursalId, storageId].every(Number.isInteger) || [productId, sucursalId, storageId].some((id) => id < 1)) {
    throw movementError('Seleccione sucursal, almacén y producto válidos.');
  }

  const models = dependencies.models || db;
  const transactionManager = dependencies.sequelize || models.sequelize;
  const postEffect = dependencies.applyExplicitEffect || inventoryPosting.applyExplicitEffect;
  const hasAvailableStock = dependencies.hasAvailableStock || availabilityService.hasAvailableStock;
  const integrity = dependencies.integrity || integrityService;
  return transactionManager.transaction(async (transaction) => {
    const [product, storage] = await Promise.all([
      models.Product.findOne({ where: { id: productId, status: true }, transaction }),
      models.Storage.findOne({ where: { id: storageId, id_sucursal: sucursalId, status: true }, transaction }),
    ]);
    if (!product) throw movementError('El producto no existe o está inactivo.', 404);
    if (!storage) throw movementError('El almacén no pertenece a la sucursal seleccionada o está inactivo.', 404);
    const location = { productId, sucursalId, storageId };
    await integrity.verifyStockKardexIntegrity({ ...location, transaction });
    if (direction === 'OUTPUT') {
      const stock = await models.Stock.findOne({ where: { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true }, transaction, lock: transaction.LOCK.UPDATE });
      const availability = await hasAvailableStock(stock, amount, transaction);
      if (!availability.sufficient) throw movementError(`La salida supera el stock disponible (${availability.available_stock} kg); hay cantidades reservadas por conciliación.`, 409);
    }
    const date = new Date();
    const result = await postEffect({
      ...location, quantity: amount, direction, actorUserId, date,
      details: `${direction === 'INPUT' ? 'INGRESO' : 'SALIDA'} MANUAL DE KARDEX · ${note}`,
      registryNumber: `MANUAL-${idempotencyKey}`,
      sourceType: 'MANUAL_KARDEX', sourceId: String(actorUserId), sourceDetailId: idempotencyKey,
      effectType: direction === 'INPUT' ? 'MANUAL_INPUT' : 'MANUAL_OUTPUT',
      idempotencyKey: `MANUAL_KARDEX:${idempotencyKey}`, transaction,
    });
    if (!result.repeated) {
      await models.History.create({
        id_user: actorUserId,
        description: `${direction === 'INPUT' ? 'INGRESO' : 'SALIDA'} MANUAL DE KARDEX · ${product.cod} · ${amount} kg. Motivo: ${note}`,
        type: 'MOVIMIENTO MANUAL KARDEX', module: 'KARDEX', action: 'CREATE',
        id_sucursal: sucursalId, id_reference: result.movement.id, status: true,
      }, { transaction });
    }
    const after = await integrity.verifyStockKardexIntegrity({ ...location, transaction });
    return { movement: result.movement, repeated: result.repeated, balance: after.physicalStock, available: after.availableQuantity };
  });
};

module.exports = { movementError, registerManualMovement };

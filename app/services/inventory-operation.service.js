'use strict';

const { Stock } = require('../database/config');
const { hasAvailableStock } = require('./stock-availability.service');
const { applyExplicitEffect } = require('./inventory-posting.service');

const operationError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const lockStock = async ({ productId, sucursalId, storageId, transaction }) => {
  const stock = await Stock.findOne({
    where: { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true },
    include: [{ association: 'product', attributes: ['cod', 'name'] }],
    transaction,
    lock: { level: transaction.LOCK.UPDATE, of: Stock },
  });
  if (!stock) throw operationError('No existe stock activo para el producto y almacén seleccionados.');
  return stock;
};

const applyOperationEffect = async ({ direction, productId, sucursalId, storageId, quantity, actorUserId, date, details, registryNumber, cost = 0, heldAllowance = 0, transaction }) => {
  if (direction === 'OUTPUT') {
    const stock = await lockStock({ productId, sucursalId, storageId, transaction });
    const availability = await hasAvailableStock(stock, quantity, transaction);
    if (Number(availability.available_stock) + Number(heldAllowance || 0) + 0.0001 < Number(quantity)) {
      throw operationError(`Stock insuficiente para ${stock.product.cod} - ${stock.product.name}. Disponible: ${availability.available_stock}.`, 409);
    }
  }
  try {
    const result = await applyExplicitEffect({
      direction, productId, sucursalId, storageId, quantity, actorUserId, date, details,
      registryNumber, cost, heldAllowance, transaction,
    });
    return result.movement;
  } catch (error) {
    if (error.code === 'INVENTORY_POSTING_REJECTED') throw operationError(error.message, error.statusCode);
    throw error;
  }
};

const decreaseStock = (options) => applyOperationEffect({ ...options, direction: 'OUTPUT' });
const increaseStock = (options) => applyOperationEffect({ ...options, direction: 'INPUT' });

module.exports = { operationError, lockStock, decreaseStock, increaseStock };

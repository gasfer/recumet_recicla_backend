'use strict';

const { Stock, kardexMovements } = require('../database/config');
const { hasAvailableStock } = require('./stock-availability.service');

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

const decreaseStock = async ({ productId, sucursalId, storageId, quantity, actorUserId, date, details, registryNumber, cost = 0, heldAllowance = 0, transaction }) => {
  const stock = await lockStock({ productId, sucursalId, storageId, transaction });
  const availability = await hasAvailableStock(stock, quantity, transaction);
  if (Number(availability.available_stock) + Number(heldAllowance || 0) + 0.0001 < Number(quantity)) {
    throw operationError(`Stock insuficiente para ${stock.product.cod} - ${stock.product.name}. Disponible: ${availability.available_stock}.`, 409);
  }
  stock.stock = Number(stock.stock) - Number(quantity);
  await stock.save({ transaction });
  return kardexMovements.create({
    type: 'OUTPUT', date, details, quantity, cost, price: 0, total: 0,
    id_product: productId, id_user: actorUserId, id_sucursal: sucursalId,
    id_storage: storageId, status: true, registry_number: registryNumber,
  }, { transaction });
};

const increaseStock = async ({ productId, sucursalId, storageId, quantity, actorUserId, date, details, registryNumber, cost = 0, transaction }) => {
  let stock = await Stock.findOne({
    where: { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!stock) stock = await Stock.create({ stock_min: 1, stock: 0, id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true }, { transaction });
  stock.stock = Number(stock.stock) + Number(quantity);
  await stock.save({ transaction });
  return kardexMovements.create({
    type: 'INPUT', date, details, quantity, cost, price: 0, total: 0,
    id_product: productId, id_user: actorUserId, id_sucursal: sucursalId,
    id_storage: storageId, status: true, registry_number: registryNumber,
  }, { transaction });
};

module.exports = { operationError, lockStock, decreaseStock, increaseStock };

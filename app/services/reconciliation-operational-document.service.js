'use strict';

const {
  Transfers, DetailsTransfers, Classified, DetailsClassified, History,
  Product,
} = require('../database/config');
const getNumRequest = require('../helpers/generate-cod');
const { decreaseStock, increaseStock, operationError } = require('./inventory-operation.service');

const createTransfer = async ({ command, actorUserId, transaction }) => {
  const count = await Transfers.count({ where: { type_registry: 'SIN FICHA' }, transaction, lock: transaction.LOCK.UPDATE });
  const transfer = await Transfers.create({
    date_send: command.date || new Date(), observations_send: command.observations,
    total: 0, id_sucursal_send: command.sourceSucursalId, id_storage_send: command.sourceStorageId,
    id_sucursal_received: command.targetSucursalId, id_storage_received: command.targetStorageId,
    id_user_send: actorUserId, status: 'PENDING', type_registry: 'SIN FICHA',
    registry_number: getNumRequest('SF-', count + 1, 5),
  }, { transaction });
  transfer.cod = getNumRequest('TRAS', transfer.id, 5);
  await transfer.save({ transaction });
  const detail = await DetailsTransfers.create({
    id_transfer: transfer.id, id_product: command.productId, quantity: command.quantity,
    cost: command.cost || 0, total: 0, status: true,
  }, { transaction });
  const movement = await decreaseStock({
    productId: command.productId, sucursalId: command.sourceSucursalId, storageId: command.sourceStorageId,
    quantity: command.quantity, actorUserId, date: command.date || new Date(), cost: command.cost,
    details: `SALIDA TRASLADO AUTOMÁTICO #${transfer.cod}`, registryNumber: transfer.registry_number,
    heldAllowance: command.heldAllowance, transaction,
  });
  await History.create({
    id_user: actorUserId, description: `CREÓ TRASLADO AUTOMÁTICO DE CONCILIACIÓN #${transfer.cod}`,
    type: 'TRASLADO CONCILIACIÓN', module: 'TRANSFER', action: 'CREATE',
    id_sucursal: command.sourceSucursalId, id_reference: transfer.id, status: true,
  }, { transaction });
  return { type: 'TRANSFER', document: transfer, details: [detail], movements: [movement], pendingReception: true };
};

const createClassification = async ({ command, actorUserId, transaction }) => {
  if (!command.targetProductId) throw operationError('Debe seleccionar el producto de destino de la clasificación.');
  const targetProduct = await Product.findOne({ where: { id: command.targetProductId, status: true }, transaction, lock: transaction.LOCK.UPDATE });
  if (!targetProduct) throw operationError('El producto destino seleccionado no existe o está inactivo.');
  const classified = await Classified.create({
    date_classified: command.date || new Date(), type_registry: 'SIN FICHA',
    number_registry: `AUTO-${Date.now()}`, id_user: actorUserId, comments: command.observations,
    id_product: command.productId, cost_product: command.cost || 0, quantity_product: command.quantity,
    id_storage: command.sourceStorageId, id_sucursal: command.sourceSucursalId, status: 'ACTIVE',
  }, { transaction });
  classified.cod = getNumRequest('CL', classified.id, 5);
  classified.number_registry = `AUTO-${classified.cod}`;
  await classified.save({ transaction });
  const outputMovement = await decreaseStock({
    productId: command.productId, sucursalId: command.sourceSucursalId, storageId: command.sourceStorageId,
    quantity: command.quantity, actorUserId, date: command.date || new Date(), cost: command.cost,
    details: `SALIDA CLASIFICACIÓN AUTOMÁTICA #${classified.cod}`, registryNumber: classified.number_registry,
    heldAllowance: command.heldAllowance, transaction,
  });
  const detail = await DetailsClassified.create({
    id_classified: classified.id, id_product: command.targetProductId,
    quantity: command.quantity, cost: command.cost || 0, status: 'ACTIVE',
  }, { transaction });
  const inputMovement = await increaseStock({
    productId: command.targetProductId, sucursalId: command.sourceSucursalId, storageId: command.sourceStorageId,
    quantity: command.quantity, actorUserId, date: command.date || new Date(), cost: command.cost,
    details: `INGRESO CLASIFICACIÓN AUTOMÁTICA #${classified.cod}`, registryNumber: classified.number_registry, transaction,
  });
  await History.create({
    id_user: actorUserId, description: `CREÓ CLASIFICACIÓN AUTOMÁTICA DE CONCILIACIÓN #${classified.cod}`,
    type: 'CLASIFICACIÓN CONCILIACIÓN', module: 'CLASSIFIED', action: 'CREATE',
    id_sucursal: command.sourceSucursalId, id_reference: classified.id, status: true,
  }, { transaction });
  return { type: 'CLASSIFIED', document: classified, details: [detail], movements: [outputMovement, inputMovement], pendingReception: false };
};

const reverseTransfer = async ({ documentId, actorUserId, transaction }) => {
  const transfer = await Transfers.findOne({
    where: { id: documentId },
    include: [{ association: 'detailsTransfers' }],
    transaction,
    lock: { level: transaction.LOCK.UPDATE, of: Transfers },
  });
  if (!transfer) throw operationError('El traslado automático vinculado no existe.', 409);
  if (transfer.status !== 'PENDING') throw operationError('El traslado ya fue recibido o anulado; no puede revertirse automáticamente.', 409);
  const movements = [];
  for (const detail of transfer.detailsTransfers) movements.push(await increaseStock({
    productId: detail.id_product, sucursalId: transfer.id_sucursal_send, storageId: transfer.id_storage_send,
    quantity: detail.quantity, actorUserId, date: new Date(), cost: detail.cost,
    details: `REVERSIÓN TRASLADO AUTOMÁTICO #${transfer.cod}`, registryNumber: transfer.registry_number, transaction,
  }));
  transfer.status = 'ANULADO'; await transfer.save({ transaction });
  await History.create({ id_user: actorUserId, description: `REVIRTIÓ TRASLADO AUTOMÁTICO #${transfer.cod}`, type: 'REVERSIÓN CONCILIACIÓN', module: 'TRANSFER', action: 'DELETE', id_sucursal: transfer.id_sucursal_send, id_reference: transfer.id, status: true }, { transaction });
  return { document: transfer, movements };
};

const reverseClassification = async ({ documentId, actorUserId, transaction }) => {
  const classified = await Classified.findOne({
    where: { id: documentId },
    include: [{ association: 'detailsClassified' }],
    transaction,
    lock: { level: transaction.LOCK.UPDATE, of: Classified },
  });
  if (!classified) throw operationError('La clasificación automática vinculada no existe.', 409);
  if (classified.status !== 'ACTIVE') throw operationError('La clasificación ya fue anulada.', 409);
  const movements = [];
  for (const detail of classified.detailsClassified) movements.push(await decreaseStock({
    productId: detail.id_product, sucursalId: classified.id_sucursal, storageId: classified.id_storage,
    quantity: detail.quantity, actorUserId, date: new Date(), cost: detail.cost,
    details: `REVERSIÓN INGRESO CLASIFICACIÓN #${classified.cod}`, registryNumber: classified.number_registry, transaction,
  }));
  movements.push(await increaseStock({
    productId: classified.id_product, sucursalId: classified.id_sucursal, storageId: classified.id_storage,
    quantity: classified.quantity_product, actorUserId, date: new Date(), cost: classified.cost_product,
    details: `REVERSIÓN SALIDA CLASIFICACIÓN #${classified.cod}`, registryNumber: classified.number_registry, transaction,
  }));
  classified.status = 'INACTIVE'; await classified.save({ transaction });
  await History.create({ id_user: actorUserId, description: `REVIRTIÓ CLASIFICACIÓN AUTOMÁTICA #${classified.cod}`, type: 'REVERSIÓN CONCILIACIÓN', module: 'CLASSIFIED', action: 'DELETE', id_sucursal: classified.id_sucursal, id_reference: classified.id, status: true }, { transaction });
  return { document: classified, movements };
};

module.exports = { createTransfer, createClassification, reverseTransfer, reverseClassification };

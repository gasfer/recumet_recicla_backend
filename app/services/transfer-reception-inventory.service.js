'use strict';

const {
  applyDerivedStockEffect,
  applyExplicitEffect,
} = require('./inventory-posting.service');
const { ValuedKardexService } = require('./valued-kardex.service');
const { exactAdd, exactSubtract, exactCompare } = require('../helpers/number-formatter');

const valuedKardex = new ValuedKardexService();

const incrementStock = async ({ productId, sucursalId, storageId, quantity, transaction, valuation = null }) => {
  const result = await applyDerivedStockEffect({ productId, sucursalId, storageId, quantity, transaction });
  if (valuation) await valuedKardex.recordMovement({
    sourceType: 'TRANSFER_RECEIVED', id_product: productId, id_sucursal: sucursalId, id_storage: storageId,
    direction: 'INPUT', quantity, unitCost: valuation.unitCost, transaction, ...valuation,
  });
  return result.stock;
};

const createMovement = async ({ type, date, details, quantity, cost, productId, userId, sucursalId, storageId, registryNumber, sourceId, sourceDetailId, effectType, transaction }) => {
  const result = await applyExplicitEffect({
    direction: type, date, details, quantity, cost, productId, actorUserId: userId,
    sucursalId, storageId, registryNumber, sourceType: 'TRANSFER_RECEPTION', sourceId,
    sourceDetailId, effectType, idempotencyKey: `TRANSFER_RECEPTION:${sourceId}:${sourceDetailId || productId}:${effectType}`,
    transaction,
  });
  await valuedKardex.recordMovement({
    sourceType: 'TRANSFER_RECEIVED', sourceId, sourceDetailId, effectType,
    id_product: productId, id_sucursal: sucursalId, id_storage: storageId, id_user: userId,
    direction: type, quantity, unitCost: cost, movementDate: date,
    allowUnvalued: type === 'INPUT' && (cost === null || cost === undefined), transaction,
  });
  return result.movement;
};

const applyAcceptedReceipt = async ({ transfer, detail, quantityReceived, mermaProduct, userId, transaction }) => {
  const location = { sucursalId: transfer.id_sucursal_received, storageId: transfer.id_storage_received };
  const sent = detail.quantity;
  const baseReceived = exactCompare(sent, quantityReceived) <= 0 ? sent : quantityReceived;
  if (exactCompare(baseReceived, 0) > 0) await incrementStock({ productId: detail.id_product, ...location, quantity: baseReceived, transaction,
    valuation: { sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'BASE_RECEIPT', id_user: userId, unitCost: detail.cost, movementDate: transfer.date_received },
  });
  const movements = [];
  if (exactCompare(quantityReceived, sent) > 0) {
    movements.push(await createMovement({ type: 'INPUT', date: transfer.date_received, details: `EXCEDENTE TRASPASO #${transfer.cod}`, quantity: exactSubtract(quantityReceived, sent), cost: detail.cost, productId: detail.id_product, userId, ...location, registryNumber: transfer.registry_number, sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'SURPLUS', transaction }));
  }
  if (exactCompare(quantityReceived, sent) < 0) {
    if (!mermaProduct) throw Object.assign(new Error('Debe seleccionar un producto activo de la categoría de diferencias.'), { statusCode: 422 });
    const shortage = exactSubtract(sent, quantityReceived);
    movements.push(await createMovement({ type: 'INPUT', date: transfer.date_received, details: `MERMA TRASPASO #${transfer.cod}`, quantity: shortage, cost: null, productId: mermaProduct.id, userId, ...location, registryNumber: transfer.registry_number, sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'SHORTAGE', transaction }));
  }
  return movements;
};

const applyBlockedShortageReceipt = async ({ transfer, shortageDetails, mermaProduct, userId, transaction }) => {
  if (!mermaProduct) {
    throw Object.assign(new Error('Debe seleccionar un producto activo de la categoría de diferencias.'), { statusCode: 422 });
  }
  const location = { sucursalId: transfer.id_sucursal_received, storageId: transfer.id_storage_received };

  for (const { detail, quantityReceived } of shortageDetails) {
    if (exactCompare(quantityReceived, 0) > 0) {
      await incrementStock({ productId: detail.id_product, ...location, quantity: quantityReceived, transaction,
        valuation: { sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'BASE_RECEIPT', id_user: userId, unitCost: detail.cost, movementDate: transfer.date_received },
      });
    }
  }

  const totalShortage = shortageDetails.reduce((sum, { detail, quantityReceived }) => (
    exactAdd(sum, exactSubtract(detail.quantity, quantityReceived))
  ), 0);

  const shortageMovement = await createMovement({
    type: 'INPUT',
    date: transfer.date_received,
    details: `MERMA TRASPASO #${transfer.cod}`,
    quantity: totalShortage,
    cost: null,
    productId: mermaProduct.id,
    userId,
    ...location,
    registryNumber: transfer.registry_number,
    sourceId: transfer.id,
    sourceDetailId: shortageDetails.map(({ detail }) => detail.id).sort((a, b) => a - b).join(','),
    effectType: 'SHORTAGE',
    transaction,
  });

  return { shortageMovement, totalShortage };
};

const applyBlockedExcessReceipt = async ({ transfer, detail, quantityReceived, userId, transaction }) => {
  const location = { sucursalId: transfer.id_sucursal_received, storageId: transfer.id_storage_received };
  const sent = detail.quantity;
  const excess = exactSubtract(quantityReceived, sent);

  if (exactCompare(sent, 0) > 0) await incrementStock({ productId: detail.id_product, ...location, quantity: sent, transaction,
    valuation: { sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'BASE_RECEIPT', id_user: userId, unitCost: detail.cost, movementDate: transfer.date_received },
  });

  let excessMovement = null;
  if (exactCompare(excess, 0) > 0) {
    excessMovement = await createMovement({
      type: 'INPUT',
      date: transfer.date_received,
      details: `EXCEDENTE TRASPASO #${transfer.cod}`,
      quantity: excess,
      cost: detail.cost,
      productId: detail.id_product,
      userId,
      ...location,
      registryNumber: transfer.registry_number,
      sourceId: transfer.id,
      sourceDetailId: detail.id,
      effectType: 'SURPLUS',
      transaction,
    });
  }

  return { excessMovement, excess };
};

module.exports = {
  applyAcceptedReceipt,
  applyBlockedShortageReceipt,
  applyBlockedExcessReceipt,
  incrementStock,
};

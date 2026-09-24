'use strict';

const { Op } = require('sequelize');
const {
  TransferReviewResolutionAction,
  TransferReviewActionMovement,
  TransferReviewNote,
  kardexMovements,
} = require('../database/config');
const { applyExplicitEffect, registerKardexOnlyEffect } = require('./inventory-posting.service');
const operationalDocuments = require('./reconciliation-operational-document.service');
const { ValuedKardexService } = require('./valued-kardex.service');

const valuedKardex = new ValuedKardexService();

const oppositeDirection = (type) => (type === 'INPUT' ? 'OUTPUT' : 'INPUT');
const movementLocation = (movement) => ({
  productId: movement.id_product,
  sucursalId: movement.id_sucursal,
  storageId: movement.id_storage,
});

const compensateMovement = async ({ movement, transfer, actorUserId, actionId, effectType, stockEffect = true, transaction }) => {
  const postEffect = stockEffect ? applyExplicitEffect : registerKardexOnlyEffect;
  const result = await postEffect({
    ...movementLocation(movement),
    quantity: Number(movement.quantity),
    direction: oppositeDirection(movement.type),
    actorUserId,
    date: new Date(),
    cost: Number(movement.cost || 0),
    details: `ANULACIÓN RECEPCIÓN #${transfer.cod} · REVERSIÓN ${movement.details || 'MOVIMIENTO'}`,
    registryNumber: transfer.registry_number,
    sourceType: 'TRANSFER_RECEPTION_CANCELLATION',
    sourceId: transfer.id,
    sourceDetailId: actionId || movement.id,
    effectType,
    idempotencyKey: `TRANSFER_RECEPTION_CANCELLATION:${transfer.id}:${actionId || 'RECEIPT'}:${movement.id}`,
    transaction,
  });
  await valuedKardex.reverseOriginal({
    originalSourceType: 'TRANSFER_RECEIVED', originalSourceId: transfer.id,
    originalSourceDetailId: movement.source_detail_id, originalEffectType: movement.effect_type,
    sourceType: 'REVERSAL', sourceId: `TRANSFER_RECEPTION_CANCELLATION:${transfer.id}`,
    sourceDetailId: movement.id, effectType, id_user: actorUserId, movementDate: new Date(),
    id_product: movement.id_product, id_sucursal: movement.id_sucursal, id_storage: movement.id_storage,
    transaction,
  });
  return { movement: result.movement, location: movementLocation(movement) };
};

const reverseReconciliationActions = async ({ transfer, actorUserId, reason, transaction }) => {
  const actions = await TransferReviewResolutionAction.findAll({
    where: {
      management_status: 'ACTIVA',
      operation_status: 'ACTIVE',
    },
    include: [
      { association: 'reviewNote', where: { id_transfer: transfer.id }, required: true },
      { association: 'movementLinks', where: { movement_role: 'ORIGINAL' }, required: false, include: [{ association: 'kardexMovement', required: false }] },
    ],
    transaction,
    lock: transaction.LOCK?.UPDATE || true,
  });
  const locations = [];

  for (const action of actions) {
    action.operation_status = 'REVERSAL_PENDING';
    await action.save({ transaction });

    const canReverseDocument = action.operation_mode === 'CREATED_AUTOMATICALLY'
      && ['TRANSFER', 'CLASSIFIED'].includes(action.operation_type)
      && action.operation_id;
    if (canReverseDocument) {
      const reversed = action.operation_type === 'TRANSFER'
        ? await operationalDocuments.reverseTransfer({ documentId: action.operation_id, actorUserId, transaction })
        : await operationalDocuments.reverseClassification({ documentId: action.operation_id, actorUserId, transaction });
      for (let index = 0; index < reversed.movements.length; index += 1) {
        const compensation = reversed.movements[index];
        const originalLink = action.movementLinks[index] || null;
        await TransferReviewActionMovement.create({
          id_transfer_review_resolution_action: action.id,
          id_kardex_movement: compensation.id,
          movement_role: 'COMPENSATION',
          id_compensates_movement: originalLink?.id_kardex_movement || null,
        }, { transaction });
        locations.push(movementLocation(compensation));
      }
    } else {
      for (const link of action.movementLinks || []) {
        if (!link.kardexMovement) continue;
        const compensation = await compensateMovement({
          movement: link.kardexMovement,
          transfer,
          actorUserId,
          actionId: action.id,
          effectType: 'REVERSE_RECONCILIATION',
          stockEffect: action.operation_type !== 'KARDEX_ENTRY',
          transaction,
        });
        await TransferReviewActionMovement.create({
          id_transfer_review_resolution_action: action.id,
          id_kardex_movement: compensation.movement.id,
          movement_role: 'COMPENSATION',
          id_compensates_movement: link.id_kardex_movement,
        }, { transaction });
        locations.push(compensation.location);
      }
    }

    action.operation_status = 'REVERSED';
    action.management_status = 'REVERTIDA';
    action.reversal_reason = reason;
    action.reversed_at = new Date();
    action.id_reversed_user = actorUserId;
    await action.save({ transaction });
  }
  return locations;
};

const preserveAndReverseReceipt = async ({ transfer, actorUserId, transaction }) => {
  const locations = [];
  const explicitMovements = await kardexMovements.findAll({
    where: { source_type: 'TRANSFER_RECEPTION', source_id: transfer.id, status: true },
    transaction,
    lock: transaction.LOCK?.UPDATE || true,
  });
  for (const movement of explicitMovements) {
    const compensation = await compensateMovement({
      movement,
      transfer,
      actorUserId,
      effectType: 'REVERSE_RECEIPT_EXPLICIT',
      transaction,
    });
    locations.push(compensation.location);
  }

  for (const detail of transfer.detailsTransfers || []) {
    const received = Number(detail.quantity_received || 0);
    const baseQuantity = Math.min(Number(detail.quantity || 0), received);
    if (baseQuantity > 0) {
      const common = {
        productId: detail.id_product,
        sucursalId: transfer.id_sucursal_received,
        storageId: transfer.id_storage_received,
        quantity: baseQuantity,
        actorUserId,
        date: transfer.date_received || new Date(),
        cost: Number(detail.cost || 0),
        registryNumber: transfer.registry_number,
        sourceType: 'TRANSFER_RECEPTION_CANCELLATION',
        sourceId: transfer.id,
        sourceDetailId: detail.id,
        transaction,
      };
      await registerKardexOnlyEffect({
        ...common,
        direction: 'INPUT',
        details: `RECEPCIÓN ORIGINAL TRASLADO #${transfer.cod} · CONSERVADA POR ANULACIÓN`,
        effectType: 'PRESERVE_ORIGINAL_RECEIPT',
        idempotencyKey: `TRANSFER_RECEPTION_CANCELLATION:${transfer.id}:${detail.id}:PRESERVE_ORIGINAL_RECEIPT`,
      });
      await applyExplicitEffect({
        ...common,
        direction: 'OUTPUT',
        details: `ANULACIÓN RECEPCIÓN TRASLADO #${transfer.cod} · SALIDA COMPENSATORIA`,
        effectType: 'REVERSE_BASE_RECEIPT',
        idempotencyKey: `TRANSFER_RECEPTION_CANCELLATION:${transfer.id}:${detail.id}:REVERSE_BASE_RECEIPT`,
      });
      await valuedKardex.reverseOriginal({
        originalSourceType: 'TRANSFER_RECEIVED', originalSourceId: transfer.id,
        originalSourceDetailId: detail.id, originalEffectType: 'BASE_RECEIPT',
        sourceType: 'REVERSAL', sourceId: `TRANSFER_RECEPTION_CANCELLATION:${transfer.id}`,
        sourceDetailId: detail.id, effectType: 'REVERSE_BASE_RECEIPT', id_user: actorUserId,
        movementDate: new Date(), id_product: detail.id_product,
        id_sucursal: transfer.id_sucursal_received, id_storage: transfer.id_storage_received, transaction,
      });
      locations.push({ productId: detail.id_product, sucursalId: transfer.id_sucursal_received, storageId: transfer.id_storage_received });
    }
    detail.quantity_received = null;
    detail.observation = null;
    detail.tolerance_decision = null;
    detail.receipt_difference_percentage = null;
    detail.accounting_status = 'REVERTIDO';
    detail.accounting_applied_at = null;
    await detail.save({ transaction });
  }
  return locations;
};

const closeReconciliationTrace = async ({ transferId, actorUserId, reason, transaction }) => {
  await TransferReviewNote.update({
    management_status: 'REVERTIDA',
    management_reason: reason,
    reverted_at: new Date(),
    id_reverted_user: actorUserId,
  }, { where: { id_transfer: transferId, management_status: { [Op.ne]: 'ELIMINADA' } }, transaction });
};

module.exports = {
  compensateMovement,
  reverseReconciliationActions,
  preserveAndReverseReceipt,
  closeReconciliationTrace,
};

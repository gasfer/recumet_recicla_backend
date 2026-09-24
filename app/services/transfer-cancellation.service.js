'use strict';

const { Transfers, Stock, History } = require('../database/config');
const { applyExplicitEffect } = require('./inventory-posting.service');
const integrityService = require('./stock-kardex-integrity.service');
const eligibilityService = require('./transfer-cancellation-eligibility.service');
const receptionCancellation = require('./transfer-reception-cancellation.service');
const { ValuedKardexService } = require('./valued-kardex.service');

const valuedKardex = new ValuedKardexService();

const cancellationError = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode, code: 'TRANSFER_CANCELLATION_REJECTED' });

const cancelPendingTransfer = async ({ transferId, actorUserId, transaction }) => {
  const transfer = await Transfers.findOne({
    where: { id: transferId, status: 'PENDING' },
    include: [{ association: 'detailsTransfers' }],
    transaction,
    lock: { level: transaction.LOCK?.UPDATE || 'UPDATE', of: Transfers },
  });
  if (!transfer) {
    const alreadyCancelled = await Transfers.findOne({ where: { id: transferId, status: 'ANULADO' }, transaction });
    if (alreadyCancelled) return { transfer: alreadyCancelled, idempotent: true };
    throw cancellationError('El traslado no está pendiente o no existe.');
  }
  const locations = transfer.detailsTransfers.map((detail) => ({
    productId: detail.id_product,
    sucursalId: transfer.id_sucursal_send,
    storageId: transfer.id_storage_send,
  }));
  const beforeDiagnostics = [];
  for (const location of integrityService.uniqueSortedLocations(locations)) {
    beforeDiagnostics.push(await integrityService.getStockKardexIntegrity({ ...location, transaction }));
  }
  for (const detail of transfer.detailsTransfers) {
    const result = await applyExplicitEffect({
      productId: detail.id_product, sucursalId: transfer.id_sucursal_send, storageId: transfer.id_storage_send,
      quantity: Number(detail.quantity), direction: 'INPUT', actorUserId, date: new Date(), cost: Number(detail.cost || 0),
      details: `BAJA TRASLADO #${transfer.cod} · REPOSICIÓN DE SALIDA`, registryNumber: transfer.registry_number,
      sourceType: 'TRANSFER_CANCELLATION', sourceId: transfer.id, sourceDetailId: detail.id, effectType: 'RESTORE_ORIGIN',
      idempotencyKey: `TRANSFER_CANCELLATION:${transfer.id}:${detail.id}:RESTORE_ORIGIN`, transaction,
    });
    if (result.repeated) throw cancellationError('La baja ya fue confirmada previamente.');
    await valuedKardex.reverseOriginal({
      originalSourceType: 'TRANSFER_SENT', originalSourceId: transfer.id, originalSourceDetailId: detail.id,
      sourceType: 'REVERSAL', sourceId: `TRANSFER_CANCELLATION:${transfer.id}`,
      sourceDetailId: detail.id, effectType: 'RESTORE_ORIGIN', id_user: actorUserId,
      movementDate: new Date(), id_product: detail.id_product,
      id_sucursal: transfer.id_sucursal_send, id_storage: transfer.id_storage_send, transaction,
    });
  }
  transfer.status = 'ANULADO';
  await transfer.save({ transaction });
  await integrityService.verifyLocationsIntegrityPreserved({ locations, beforeDiagnostics, transaction });
  await History.create({ id_user: actorUserId, description: `BAJA DEL TRASLADO #${transfer.cod}; salida original y reposición conservadas en Kardex.`, type: 'BAJA TRASLADO', module: 'TRANSFER', action: 'DELETE', id_sucursal: transfer.id_sucursal_send, id_reference: transfer.id, status: true }, { transaction });
  return { transfer, idempotent: false, notification: { title: `Traslado ${transfer.cod} dado de baja`, message: 'La salida original y su reposición quedaron registradas en Kardex.', type: 'TRANSFER_CANCELLATION', level: 'WARNING', id_reference: transfer.id } };
};

const cancelReceivedTransfer = async ({ transferId, actorUserId, reason, transaction }) => {
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length < 10) throw cancellationError('El motivo de anulación debe tener al menos 10 caracteres.', 422);
  const eligibility = await eligibilityService.getCancellationEligibility({ transferId, transaction });
  if (!eligibility.eligible || eligibility.mode !== 'CANCEL_RECEPTION') {
    const error = cancellationError(eligibility.reason || 'La recepción no puede anularse en su estado actual.');
    if (eligibility.blockers) error.details = { blockers: eligibility.blockers };
    throw error;
  }
  const transfer = await Transfers.findOne({
    where: { id: transferId, status: 'RECEIVED' },
    include: [{ association: 'detailsTransfers' }],
    transaction,
    lock: { level: transaction.LOCK?.UPDATE || 'UPDATE', of: Transfers },
  });
  if (!transfer) throw cancellationError('La recepción cambió de estado antes de confirmar la anulación.');

  const reconciliationLocations = await receptionCancellation.reverseReconciliationActions({
    transfer, actorUserId, reason: normalizedReason, transaction,
  });
  const receiptLocations = await receptionCancellation.preserveAndReverseReceipt({ transfer, actorUserId, transaction });
  await receptionCancellation.closeReconciliationTrace({ transferId: transfer.id, actorUserId, reason: normalizedReason, transaction });

  const receivedSucursalId = transfer.id_sucursal_received;
  transfer.status = 'PENDING';
  transfer.id_user_received = null;
  transfer.id_storage_received = null;
  transfer.observations_received = null;
  transfer.date_received = null;
  await transfer.save({ transaction });

  await integrityService.verifyLocationsIntegrity({ locations: [...reconciliationLocations, ...receiptLocations], transaction });
  await History.create({
    id_user: actorUserId,
    description: `ANULÓ RECEPCIÓN DEL TRASLADO #${transfer.cod}. Motivo: ${normalizedReason}. Movimientos originales y compensatorios conservados en Kardex.`,
    type: 'ANULACIÓN RECEPCIÓN',
    module: 'TRANSFER',
    action: 'DELETE',
    id_sucursal: receivedSucursalId,
    id_reference: transfer.id,
    status: true,
  }, { transaction });
  return {
    transfer,
    idempotent: false,
    notification: {
      title: `Recepción ${transfer.cod} anulada`,
      message: `La recepción y sus conciliaciones fueron revertidas. Motivo: ${normalizedReason}`,
      type: 'TRANSFER_RECEPTION_CANCELLATION',
      level: 'WARNING',
      id_reference: transfer.id,
    },
  };
};

module.exports = { cancellationError, cancelPendingTransfer, cancelReceivedTransfer };

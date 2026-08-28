const getNumRequest = require('../helpers/generate-cod');
const {
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewInventoryHold,
  TransferReviewEvent,
} = require('../database/config');
const { REVIEW_HOLD_DISPOSITIONS } = require('../constants/transfer-review');
const notificationService = require('./notification.service');

const createTransferReviewNote = async ({ type, date, observations, transfer, kardexMovement, productId, userId, storageId, details }, transaction) => {
  const note = await TransferReviewNote.create({
    registry_number: `TMP-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    date,
    observations,
    id_transfer: transfer.id,
    id_kardex_movement: kardexMovement.id,
    id_product: productId,
    id_user: userId,
    id_sucursal: transfer.id_sucursal_received,
    id_storage: storageId,
  }, { transaction });

  note.registry_number = getNumRequest('NTR-', note.id, 6);
  await note.save({ transaction });
  const createdDetails = await TransferReviewNoteDetail.bulkCreate(details.map((detail) => ({
    ...detail,
    id_transfer_review_note: note.id,
  })), { transaction, returning: true });
  await TransferReviewInventoryHold.bulkCreate(createdDetails.map((detail) => ({
    quantity: detail.quantity_difference,
    disposition: REVIEW_HOLD_DISPOSITIONS.IN_REVIEW,
    id_transfer_review_note_detail: detail.id,
    id_product: productId,
    id_sucursal: transfer.id_sucursal_received,
    id_storage: storageId,
    id_created_user: userId,
  })), { transaction });
  await TransferReviewEvent.create({
    event_type: 'CREADA',
    description: type === 'FALTANTE_PARA_REVISION'
      ? 'Recepción registrada con faltante pendiente de revisión.'
      : 'Recepción registrada con excedente pendiente de revisión.',
    metadata: { type, transfer_id: transfer.id, kardex_movement_id: kardexMovement.id },
    id_transfer_review_note: note.id,
    id_user: userId,
  }, { transaction });
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Recepción ${transfer.cod} inconclusa`,
    message: type === 'FALTANTE_PARA_REVISION'
      ? `La recepción ${transfer.cod} tiene productos faltantes pendientes de revisión.`
      : `La recepción ${transfer.cod} tiene productos excedentes pendientes de revisión.`,
    type: 'TRANSFER_REVIEW_CREATED',
    level: 'DANGER',
    eventKey: `review-created:${note.id}`,
  }, transaction, userId);
  return note;
};

module.exports = { createTransferReviewNote };

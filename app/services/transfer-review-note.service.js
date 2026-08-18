const getNumRequest = require('../helpers/generate-cod');
const { TransferReviewNote, TransferReviewNoteDetail } = require('../database/config');

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
  await TransferReviewNoteDetail.bulkCreate(details.map((detail) => ({
    ...detail,
    id_transfer_review_note: note.id,
  })), { transaction });
  return note;
};

module.exports = { createTransferReviewNote };

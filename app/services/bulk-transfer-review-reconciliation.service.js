'use strict';

const { sequelize, TransferReviewNote, TransferReviewNoteDetail } = require('../database/config');
const automatedResolution = require('./automated-transfer-review-resolution.service');

const bulkError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) throw bulkError('Seleccione al menos una diferencia para conciliar.');
  const ids = items.map(({ detail_id }) => Number(detail_id));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw bulkError('La selección de diferencias no es válida.');
  }
  return items;
};

const assertNoteDetails = async ({ noteId, items, transaction }) => {
  const details = await TransferReviewNoteDetail.findAll({
    where: { id_transfer_review_note: noteId, id: items.map(({ detail_id }) => Number(detail_id)) },
    transaction,
    lock: transaction.LOCK.UPDATE,
    order: [['id', 'ASC']],
  });
  if (details.length !== items.length) throw bulkError('Todos los detalles deben pertenecer a la misma boleta de revisión.', 409);
  return details;
};

const preview = async ({ noteId, items }) => {
  const selected = normalizeItems(items);
  await sequelize.transaction(async (transaction) => {
    const note = await TransferReviewNote.findByPk(noteId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!note) throw bulkError('Boleta de revisión no encontrada.', 404);
    await assertNoteDetails({ noteId, items: selected, transaction });
  });
  const results = await Promise.all(selected.map(async (item) => {
    try { return { detail_id: Number(item.detail_id), preview: await automatedResolution.preview({ noteId, detailId: Number(item.detail_id) }) }; }
    catch (error) { return { detail_id: Number(item.detail_id), error: error.message }; }
  }));
  return { note_id: noteId, items: results, ready: results.every(({ preview: value }) => value?.status === 'READY') };
};

const confirm = async ({ noteId, items, idempotencyKey, actorUserId }) => {
  const selected = normalizeItems(items);
  if (!idempotencyKey) throw bulkError('La clave de idempotencia del grupo es obligatoria.');
  try {
    return await sequelize.transaction(async (transaction) => {
      const note = await TransferReviewNote.findByPk(noteId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!note) throw bulkError('Boleta de revisión no encontrada.', 404);
      await assertNoteDetails({ noteId, items: selected, transaction });
      const results = [];
      for (const item of [...selected].sort((a, b) => Number(a.detail_id) - Number(b.detail_id))) {
        results.push(await automatedResolution.confirmInTransaction({
          noteId, detailId: Number(item.detail_id), solutionCode: String(item.solution_code || ''),
          targetProductId: item.id_target_product, reasonCode: String(item.reason_code || ''),
          justification: String(item.operational_justification || ''), documentReferences: item.document_references,
          authorizerUserId: Number(item.id_authorizer_user), detailVersion: item.detail_version,
          quantity: item.quantity, idempotencyKey: `${idempotencyKey}:${item.detail_id}`, actorUserId, transaction,
        }));
      }
      return { note_id: noteId, items: results, idempotent: results.every(({ idempotent }) => idempotent) };
    });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') throw bulkError('La conciliación cambió. Actualice la boleta e intente nuevamente.', 409);
    throw error;
  }
};

module.exports = { preview, confirm };

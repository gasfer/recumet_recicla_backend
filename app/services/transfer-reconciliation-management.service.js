'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewResolutionAction,
  TransferReviewInventoryHold,
  TransferReviewActionMovement,
} = require('../database/config');
const notificationService = require('./notification.service');
const workflowService = require('./transfer-review-workflow.service');
const operationalDocuments = require('./reconciliation-operational-document.service');

const MANAGEMENT_STATUS = Object.freeze({ ACTIVE: 'ACTIVA', REVERTED: 'REVERTIDA', DELETED: 'ELIMINADA' });

const list = async ({ page = 1, limit = 25, query = '', status, idSucursal, dateFrom, dateTo }) => {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const where = {
    ...(status ? { management_status: status } : { management_status: { [Op.ne]: MANAGEMENT_STATUS.DELETED } }),
    ...(idSucursal ? { id_sucursal: Number(idSucursal) } : {}),
  };
  if (query) where[Op.or] = [
    { registry_number: { [Op.iLike]: `%${String(query).trim()}%` } },
    { '$transfer.cod$': { [Op.iLike]: `%${String(query).trim()}%` } },
  ];
  if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { [Op.gte]: new Date(dateFrom) } : {}),
      ...(dateTo ? { [Op.lte]: new Date(`${dateTo}T23:59:59.999`) } : {}),
    };
  }
  const notes = await TransferReviewNote.findAll({
    where,
    include: [
      { association: 'transfer', attributes: ['id', 'cod', 'date_received'], include: [
        { association: 'sucursal_send', attributes: ['id', 'name'] },
        { association: 'sucursal_received', attributes: ['id', 'name'] },
      ] },
      { association: 'registeredProduct', attributes: ['id', 'cod', 'name'] },
      { association: 'assignedUser', attributes: ['id', 'full_names'] },
      { association: 'details', include: [
        { association: 'product', attributes: ['id', 'cod', 'name'] },
        { association: 'resolutionActions', include: [{ association: 'movementLinks', include: [{ association: 'kardexMovement' }] }] },
      ] },
    ],
    subQuery: false,
    order: [['id_transfer', 'DESC'], ['date', 'DESC'], ['id', 'DESC']],
  });
  const groups = [...notes.reduce((grouped, note) => {
    const key = Number(note.id_transfer);
    const current = grouped.get(key);
    if (current) {
      current.reconciliations.push(note);
      if (new Date(note.date) > new Date(current.date)) current.date = note.date;
      return grouped;
    }
    grouped.set(key, {
      id_transfer: key,
      transfer: note.transfer,
      date: note.date,
      reconciliations: [note],
    });
    return grouped;
  }, new Map()).values()].sort((first, second) => new Date(second.date) - new Date(first.date));
  const offset = (normalizedPage - 1) * normalizedLimit;
  return {
    data: groups.slice(offset, offset + normalizedLimit),
    total: groups.length,
    page: normalizedPage,
    limit: normalizedLimit,
  };
};

const reverse = async ({ noteId, reason, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    include: [{ association: 'details', include: [{ association: 'inventoryHolds' }] }],
    transaction,
    lock: { level: transaction.LOCK.UPDATE, of: TransferReviewNote },
  });
  if (!note) throw Object.assign(new Error('Conciliación no encontrada.'), { statusCode: 404 });
  if (note.management_status !== MANAGEMENT_STATUS.ACTIVE) {
    throw Object.assign(new Error('Solo se puede revertir una conciliación activa.'), { statusCode: 409 });
  }
  if (String(reason || '').trim().length < 10) {
    throw Object.assign(new Error('El motivo de reversión debe tener al menos 10 caracteres.'), { statusCode: 422 });
  }

  const automaticActions = await TransferReviewResolutionAction.findAll({
    where: {
      id_transfer_review_note: note.id,
      management_status: MANAGEMENT_STATUS.ACTIVE,
      operation_mode: 'CREATED_AUTOMATICALLY',
      operation_status: { [Op.in]: ['ACTIVE', 'PENDING_RECEPTION'] },
    },
    include: [{ association: 'movementLinks', where: { movement_role: 'ORIGINAL' }, required: false }],
    transaction,
    lock: { level: transaction.LOCK.UPDATE, of: TransferReviewResolutionAction },
  });
  const activeVerifiedExisting = await TransferReviewResolutionAction.count({
    where: {
      id_transfer_review_note: note.id,
      management_status: MANAGEMENT_STATUS.ACTIVE,
      operation_mode: { [Op.ne]: 'CREATED_AUTOMATICALLY' },
    },
    transaction,
  });
  if (activeVerifiedExisting > 0) {
    throw Object.assign(new Error('Esta conciliación verificó documentos creados fuera del expediente. Requiere anularlos primero en sus módulos para evitar una reversión parcial.'), { statusCode: 409 });
  }
  for (const action of automaticActions) {
    action.operation_status = 'REVERSAL_PENDING';
    await action.save({ transaction });
    const reversed = action.operation_type === 'TRANSFER'
      ? await operationalDocuments.reverseTransfer({ documentId: action.operation_id, actorUserId, transaction })
      : action.operation_type === 'CLASSIFIED'
        ? await operationalDocuments.reverseClassification({ documentId: action.operation_id, actorUserId, transaction })
        : action.operation_type === 'CONFIRMATION'
          ? { movements: [] }
          : null;
    if (!reversed) throw Object.assign(new Error('El tipo de operación automática no admite reversión.'), { statusCode: 409 });
    for (let index = 0; index < reversed.movements.length; index += 1) {
      const originalLink = action.movementLinks[index] || null;
      await TransferReviewActionMovement.create({
        id_transfer_review_resolution_action: action.id,
        id_kardex_movement: reversed.movements[index].id,
        movement_role: 'COMPENSATION',
        id_compensates_movement: originalLink?.id_kardex_movement || null,
      }, { transaction });
    }
    action.operation_status = 'REVERSED';
    action.reversal_reason = String(reason).trim();
    action.reversed_at = new Date();
    action.id_reversed_user = actorUserId;
    await action.save({ transaction });
  }

  const detailIds = note.details.map(({ id }) => id);
  await TransferReviewResolutionAction.update({ management_status: MANAGEMENT_STATUS.REVERTED }, {
    where: { id_transfer_review_note: note.id, management_status: MANAGEMENT_STATUS.ACTIVE }, transaction,
  });
  await TransferReviewNoteDetail.update({
    reconciliation_status: 'EN_REVISION', quantity_resolved: 0, cause: null, resolved_at: null, id_resolved_user: null,
  }, { where: { id: detailIds }, transaction });

  for (const detail of note.details) {
    await TransferReviewInventoryHold.destroy({ where: { id_transfer_review_note_detail: detail.id }, transaction });
    await TransferReviewInventoryHold.create({
      id_transfer_review_note_detail: detail.id,
      id_product: detail.id_product,
      id_sucursal: note.id_sucursal,
      id_storage: note.id_storage,
      id_created_user: actorUserId,
      quantity: detail.quantity_difference,
      disposition: 'EN_REVISION',
    }, { transaction });
  }

  note.management_status = MANAGEMENT_STATUS.REVERTED;
  note.management_reason = String(reason).trim();
  note.reverted_at = new Date();
  note.id_reverted_user = actorUserId;
  note.reconciliation_status = 'EN_REVISION';
  note.resolved_at = null;
  note.id_resolved_user = null;
  await note.save({ transaction });
  const event = await workflowService.createEvent(note.id, actorUserId, 'CONCILIACION_REVERTIDA', note.management_reason, {
    automatic_operations_reversed: automaticActions.map(({ operation_type, operation_id }) => ({ operation_type, operation_id })),
    warning: automaticActions.length
      ? 'Los documentos automáticos fueron anulados y el Kardex fue compensado sin borrar historia.'
      : 'No existían documentos automáticos; los documentos históricos verificados se conservaron.',
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Conciliación ${note.registry_number} revertida`,
    message: note.management_reason,
    type: 'TRANSFER_RECONCILIATION_REVERTED',
    level: 'DANGER',
    eventKey: `reconciliation-reverted:${event.id}`,
  }, transaction, actorUserId);
  return note;
});

const remove = async ({ noteId, reason, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!note) throw Object.assign(new Error('Conciliación no encontrada.'), { statusCode: 404 });
  if (note.management_status !== MANAGEMENT_STATUS.REVERTED) {
    throw Object.assign(new Error('Debe revertir la conciliación antes de eliminarla.'), { statusCode: 409 });
  }
  if (String(reason || '').trim().length < 10) {
    throw Object.assign(new Error('El motivo de eliminación debe tener al menos 10 caracteres.'), { statusCode: 422 });
  }
  note.management_status = MANAGEMENT_STATUS.DELETED;
  note.management_reason = String(reason).trim();
  note.deleted_at = new Date();
  note.id_deleted_user = actorUserId;
  await note.save({ transaction });
  const event = await workflowService.createEvent(note.id, actorUserId, 'CONCILIACION_ELIMINADA', note.management_reason, {
    deletion_mode: 'LOGICAL',
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Conciliación ${note.registry_number} eliminada`,
    message: note.management_reason,
    type: 'TRANSFER_RECONCILIATION_DELETED',
    level: 'WARNING',
    eventKey: `reconciliation-deleted:${event.id}`,
  }, transaction, actorUserId);
  return note;
});

module.exports = { MANAGEMENT_STATUS, list, reverse, remove };

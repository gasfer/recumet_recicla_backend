'use strict';

const { Op } = require('sequelize');
const { Transfers, TransferReviewNote, TransferReviewNoteDetail, TransferReviewInventoryHold, TransferReviewResolutionAction } = require('../database/config');

const ACTIVE_NOTE = 'ACTIVA';
const COMPLETED = 'COMPLETADO';
const PENDING_ACTION_STATUSES = ['PENDING_RECEPTION', 'REVERSAL_PENDING'];

const buildBlockers = ({ openNotes, openDetails, holds, pendingActions }) => [
  ...(openNotes.length ? [{ type: 'OPEN_REVIEW_NOTES', count: openNotes.length }] : []),
  ...(openDetails.length ? [{ type: 'OPEN_REVIEW_DETAILS', count: openDetails.length }] : []),
  ...(holds.length ? [{ type: 'ACTIVE_INVENTORY_HOLDS', count: holds.length }] : []),
  ...(pendingActions.length ? [{ type: 'PENDING_CORRECTIVE_ACTIONS', count: pendingActions.length }] : []),
];

const getReceptionCancellationAvailability = (notes = []) => {
  const activeNotes = notes.filter(({ management_status }) => management_status === ACTIVE_NOTE);
  const details = activeNotes.flatMap((note) => note.details || []);
  const openNotes = activeNotes.filter(({ reconciliation_status, resolved_at }) => reconciliation_status !== COMPLETED || !resolved_at);
  const openDetails = details.filter((detail) => (
    detail.reconciliation_status !== COMPLETED
    || Number(detail.quantity_resolved || 0) + 0.0001 < Number(detail.quantity_difference || 0)
  ));
  const holds = details.flatMap((detail) => detail.inventoryHolds || [])
    .filter(({ disposition }) => disposition !== 'LIBERADO_POR_AJUSTE');
  const pendingActions = activeNotes.flatMap((note) => note.resolutionActions || [])
    .filter(({ management_status, operation_status }) => (
      management_status === ACTIVE_NOTE && PENDING_ACTION_STATUSES.includes(operation_status)
    ));
  const blockers = buildBlockers({ openNotes, openDetails, holds, pendingActions });
  return blockers.length ? {
    enabled: false,
    reason: 'Complete las conciliaciones, retenciones o acciones pendientes antes de anular la recepción.',
    blockers,
  } : {
    enabled: true,
    reason: null,
    blockers: [],
  };
};

const getCancellationEligibility = async ({ transferId, transaction }) => {
  const transfer = await Transfers.findByPk(transferId, { transaction, lock: transaction?.LOCK?.UPDATE || true });
  if (!transfer) return { eligible: false, mode: 'NOT_FOUND', reason: 'El traslado no existe.' };
  if (transfer.status === 'PENDING') return { eligible: true, mode: 'CANCEL_TRANSFER', transfer };
  if (transfer.status !== 'RECEIVED') return { eligible: false, mode: 'NOT_CANCELLABLE', transfer, reason: 'El traslado no se encuentra en un estado anulable.' };
  const notes = await TransferReviewNote.findAll({
    where: { id_transfer: transfer.id, management_status: ACTIVE_NOTE },
    attributes: ['id', 'reconciliation_status', 'resolved_at'],
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  });
  const openNotes = notes.filter(({ reconciliation_status, resolved_at }) => reconciliation_status !== COMPLETED || !resolved_at);
  const noteIds = notes.map(({ id }) => id);
  const details = noteIds.length ? await TransferReviewNoteDetail.findAll({
    where: { id_transfer_review_note: { [Op.in]: noteIds } },
    attributes: ['id', 'reconciliation_status', 'quantity_difference', 'quantity_resolved'],
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  }) : [];
  const openDetails = details.filter((detail) => (
    detail.reconciliation_status !== COMPLETED
    || Number(detail.quantity_resolved || 0) + 0.0001 < Number(detail.quantity_difference || 0)
  ));
  const detailIds = details.map(({ id }) => id);
  const holds = detailIds.length ? await TransferReviewInventoryHold.findAll({
    where: { id_transfer_review_note_detail: { [Op.in]: detailIds }, disposition: { [Op.ne]: 'LIBERADO_POR_AJUSTE' } },
    attributes: ['id', 'disposition'],
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  }) : [];
  const pendingActions = noteIds.length ? await TransferReviewResolutionAction.findAll({
    where: {
      id_transfer_review_note: { [Op.in]: noteIds },
      management_status: ACTIVE_NOTE,
      operation_status: { [Op.in]: PENDING_ACTION_STATUSES },
    },
    attributes: ['id', 'operation_status', 'operation_type'],
    transaction,
    lock: transaction?.LOCK?.UPDATE || true,
  }) : [];
  const blockers = buildBlockers({ openNotes, openDetails, holds, pendingActions });
  if (blockers.length) return {
    eligible: false,
    mode: 'RECEPTION_BLOCKED',
    transfer,
    reason: 'La recepción tiene conciliaciones, retenciones o acciones pendientes. Complete todos los pendientes antes de anular.',
    blockers,
  };
  return { eligible: true, mode: 'CANCEL_RECEPTION', transfer, notes };
};

module.exports = { PENDING_ACTION_STATUSES, buildBlockers, getReceptionCancellationAvailability, getCancellationEligibility };

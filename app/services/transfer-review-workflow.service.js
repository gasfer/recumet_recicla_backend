'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewEvent,
  TransferReviewEvidence,
  Transfers,
  User,
} = require('../database/config');
const {
  REVIEW_STATUSES,
  DETAIL_REVIEW_STATUSES,
  RECONCILIATION_SPECIFIC_EFFECTS,
  REVIEW_HOLD_DISPOSITIONS,
} = require('../constants/transfer-review');
const notificationService = require('./notification.service');
const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');
const stockAvailabilityService = require('./stock-availability.service');
const { buildOpenReviewWhere } = require('./open-reception-review-query.service');
const historicalDifferenceService = require('./historical-transfer-difference.service');

const commonNoteInclude = [
  { association: 'assignedUser', attributes: ['id', 'full_names'] },
  { association: 'user', attributes: ['id', 'full_names'] },
  { association: 'details', include: [
    { association: 'product', attributes: ['id', 'cod', 'name'] },
    { association: 'inventoryHolds' },
    { association: 'transferDetail' },
  ] },
];

const deriveReconciliationStatus = (details = []) => {
  if (details.length > 0 && details.every(({ reconciliation_status: status }) => status === DETAIL_REVIEW_STATUSES.COMPLETED)) {
    return REVIEW_STATUSES.COMPLETED;
  }
  if (details.some((detail) => detail.reconciliation_status === DETAIL_REVIEW_STATUSES.COMPLETED || Number(detail.quantity_resolved) > 0)) {
    return REVIEW_STATUSES.PARTIAL;
  }
  return REVIEW_STATUSES.IN_REVIEW;
};

const deriveReceptionStatus = (notes = []) => {
  const activeNotes = notes.filter(({ management_status }) => management_status !== 'ELIMINADA');
  if (activeNotes.length === 0 || activeNotes.every(({ reconciliation_status: status }) => status === REVIEW_STATUSES.COMPLETED)) {
    return REVIEW_STATUSES.COMPLETED;
  }
  if (activeNotes.some(({ reconciliation_status: status }) => status === REVIEW_STATUSES.PARTIAL || status === REVIEW_STATUSES.COMPLETED)) {
    return REVIEW_STATUSES.PARTIAL;
  }
  return REVIEW_STATUSES.IN_REVIEW;
};

const syncNoteStatus = async (noteId, transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  const details = await TransferReviewNoteDetail.findAll({
    where: { id_transfer_review_note: noteId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  const status = deriveReconciliationStatus(details);
  note.reconciliation_status = status;
  if (status !== REVIEW_STATUSES.COMPLETED) {
    note.resolved_at = null;
    note.id_resolved_user = null;
  }
  await note.save({ transaction });
  return note;
};

const validateResolutionIntegrity = async (noteId, transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    include: [{ association: 'details', include: [{ association: 'resolutionActions', include: [{ association: 'movementLinks', include: [{ association: 'kardexMovement' }] }] }] }],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  const expectedMovementCounts = {
    ORIGEN_ENVIO_MAYOR: 1,
    ERROR_RECEPCION: 1,
    PRODUCTO_INCORRECTO: 2,
    FUENTE_EXTERNA: 0,
    TOLERANCIA_AUTORIZADA: 0,
    FALTANTE_LOCALIZADO: 2,
    PERDIDA_CONFIRMADA: 1,
    ERROR_MEDICION_FALTANTE: 2,
    RECLASIFICACION: 2,
    ACCION_MANUAL_VERIFICADA: 0,
    EXCEDENTE_DOCUMENTADO_SIN_AJUSTE: 0,
    FALTANTE_DOCUMENTADO_SIN_AJUSTE: 0,
    EXCEDENTE_REGULARIZADO_VERIFICADO: 0,
    FALTANTE_REGULARIZADO_VERIFICADO: 0,
  };
  for (const detail of note.details) {
    const activeActions = detail.resolutionActions.filter(({ management_status }) => management_status !== 'REVERTIDA');
    const actionTotal = activeActions.reduce((sum, action) => sum + Number(action.quantity), 0);
    if (detail.reconciliation_status === DETAIL_REVIEW_STATUSES.COMPLETED
      && Math.abs(Number(detail.quantity_difference) - Number(detail.quantity_resolved || 0)) > 0.0001) {
      throw Object.assign(new Error(`El detalle ${detail.id} figura completado pero conserva cantidad pendiente.`), { statusCode: 409 });
    }
    if (Math.abs(actionTotal - Number(detail.quantity_resolved || 0)) > 0.0001) {
      throw Object.assign(new Error(`El detalle ${detail.id} no concilia sus acciones con la cantidad resuelta.`), { statusCode: 409 });
    }
    for (const action of activeActions) {
      const expectedCount = expectedMovementCounts[action.strategy];
      if (expectedCount === undefined || action.movementLinks.length !== expectedCount) {
        throw Object.assign(new Error(`La acción ${action.id} no tiene los movimientos Kardex esperados.`), { statusCode: 409 });
      }
      if (action.movementLinks.some(({ kardexMovement }) => Math.abs(Number(kardexMovement.quantity) - Number(action.quantity)) > 0.0001)) {
        throw Object.assign(new Error(`La acción ${action.id} no coincide con la cantidad de sus movimientos Kardex.`), { statusCode: 409 });
      }
    }
  }
  return note;
};

const createEvent = (noteId, userId, eventType, description, metadata = {}, transaction) => (
  TransferReviewEvent.create({
    id_transfer_review_note: noteId,
    id_user: userId,
    event_type: eventType,
    description,
    metadata,
  }, { transaction })
);

const listOpenReviews = async ({ idSucursal, idStorage, assignedUserId, limit = 100 }) => {
  const where = buildOpenReviewWhere({
    ...(idSucursal ? { id_sucursal: idSucursal } : {}),
    ...(idStorage ? { id_storage: idStorage } : {}),
    ...(assignedUserId ? { id_assigned_user: assignedUserId } : {}),
  });
  const notes = await TransferReviewNote.findAll({
    where,
    include: [
      ...commonNoteInclude,
      { association: 'transfer', include: [
        { association: 'sucursal_send', attributes: ['id', 'name'] },
        { association: 'sucursal_received', attributes: ['id', 'name'] },
      ] },
    ],
    order: [['date', 'ASC'], ['id', 'ASC']],
    limit: Math.min(Number(limit) || 100, 200),
  });
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all(notes.filter((note) => (Date.now() - new Date(note.date).getTime()) >= 3 * 86400000).map((note) => (
    notificationService.notifyTransferReviewStakeholders({
      note,
      title: `Revisión vencida ${note.registry_number}`,
      message: `La revisión del traslado ${note.transfer?.cod || note.id_transfer} lleva más de 3 días inconclusa.`,
      type: 'TRANSFER_REVIEW_OVERDUE',
      level: 'DANGER',
      eventKey: `review-overdue:${note.id}:${today}`,
      reviewChanged: false,
    })
  )));
  return notes.map((note) => {
    const plain = note.toJSON();
    const activeDetails = (plain.details || []).filter((detail) =>
      !isAcceptedToleranceDecision(detail.transferDetail?.tolerance_decision)
    );
    return {
      ...plain,
      details: activeDetails,
      pending_items: activeDetails.filter((detail) => detail.reconciliation_status !== DETAIL_REVIEW_STATUSES.COMPLETED).length,
      age_days: Math.max(0, Math.floor((Date.now() - new Date(plain.date).getTime()) / 86400000)),
    };
  }).filter((note) => note.details.length > 0 && (note.pending_items > 0 || !note.resolved_at));
};

const listAssignableUsers = async (idSucursal) => {
  const users = await User.findAll({
    where: { status: true },
    attributes: ['id', 'full_names', 'role'],
    include: [
      { association: 'assign_permission', required: false, where: { module: 'TRANSFER_REVIEW', status: { [Op.ne]: false } } },
      { association: 'assign_sucursales', required: false, where: { id_sucursal: idSucursal, status: { [Op.ne]: false } } },
    ],
    order: [['full_names', 'ASC']],
  });
  return users.map((user) => ({
    id: user.id,
    full_names: user.full_names,
    role: user.role,
    can_authorize: user.role === 'ADMINISTRADOR' || (
      user.role === 'ENCARGADO'
      && user.assign_sucursales?.length > 0
      && user.assign_permission?.some(({ reports }) => reports === true)
    ),
  }));
};

const getTransferTraceability = async (transferId) => {
  const transfer = await Transfers.findByPk(transferId, {
    include: [
      { association: 'sucursal_send', attributes: ['id', 'name'] },
      { association: 'sucursal_received', attributes: ['id', 'name'] },
      { association: 'storage_send', attributes: ['id', 'name'] },
      { association: 'storage_received', attributes: ['id', 'name'] },
      { association: 'user_send', attributes: ['id', 'full_names'] },
      { association: 'user_received', attributes: ['id', 'full_names'] },
      { association: 'detailsTransfers', include: [{ association: 'product', attributes: ['id', 'cod', 'name'] }] },
      { association: 'reviewNotes', include: [
        ...commonNoteInclude,
        { association: 'registeredProduct', attributes: ['id', 'cod', 'name'] },
        { association: 'kardexMovement' },
        { association: 'events', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
        { association: 'evidences', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
        { association: 'resolutionActions', include: [
          { association: 'user', attributes: ['id', 'full_names'] },
          { association: 'approvedUser', attributes: ['id', 'full_names'] },
          { association: 'movementLinks', include: [{ association: 'kardexMovement' }] },
        ] },
      ] },
    ],
    order: [
      [{ model: TransferReviewNote, as: 'reviewNotes' }, 'date', 'ASC'],
      [{ model: TransferReviewNote, as: 'reviewNotes' }, { model: TransferReviewEvent, as: 'events' }, 'createdAt', 'ASC'],
    ],
  });
  if (!transfer) throw Object.assign(new Error('Traslado no encontrado.'), { statusCode: 404 });
  const irregularities = await stockAvailabilityService.getStockKardexIrregularities({
    idSucursal: transfer.id_sucursal_received,
    idStorage: transfer.id_storage_received,
    limit: 2000,
  });
  const relatedIrregularities = irregularities.filter(({ traceable_transfers: traceableTransfers = [] }) => (
    traceableTransfers.some(({ transfer_id: relatedTransferId }) => Number(relatedTransferId) === Number(transfer.id))
  ));
  const historicalDifferenceReconciliation = await historicalDifferenceService.getProjection(transfer.id);
  const transferJson = transfer.toJSON ? transfer.toJSON() : transfer;
  const detailsTransfers = (transferJson.detailsTransfers || []).map((detail) => {
    const sent = Number(detail.quantity || 0);
    const received = Number(detail.quantity_received || 0);
    const isAccepted = isAcceptedToleranceDecision(detail.tolerance_decision);
    const normalQuantity = isAccepted ? received : Math.min(sent, received);
    const diffPct = detail.receipt_difference_percentage !== null && detail.receipt_difference_percentage !== undefined
      ? Number(detail.receipt_difference_percentage)
      : null;
    const blockedQuantity = isAccepted ? 0 : Math.abs(received - sent);
    const isShortage = !isAccepted && received < sent;

    const matchingNote = (transferJson.reviewNotes || []).find((note) =>
      (note.details || []).some((nd) => Number(nd.id_detail_transfer) === Number(detail.id))
    );
    const matchingNoteDetail = matchingNote
      ? (matchingNote.details || []).find((nd) => Number(nd.id_detail_transfer) === Number(detail.id))
      : null;
    const heldQuantity = Number((matchingNoteDetail?.inventoryHolds || [])
      .filter(({ disposition, id_product: holdProductId }) => (
        !isShortage
        && Number(holdProductId) === Number(detail.id_product)
        && (disposition === REVIEW_HOLD_DISPOSITIONS.IN_REVIEW
          || disposition === REVIEW_HOLD_DISPOSITIONS.RETAINED_WITHOUT_ADJUSTMENT)
      ))
      .reduce((total, hold) => total + Number(hold.quantity || 0), 0));
    const availableQuantity = Math.max(0, received - heldQuantity);

    let releaseStatus = 'NO_APLICA';
    let blockedDocument = null;

    if (transfer.status === 'PENDING') {
      releaseStatus = 'PENDIENTE';
    } else if (isAccepted) {
      releaseStatus = 'ACEPTADO';
    } else if (blockedQuantity > 0) {
      if (matchingNote) {
        blockedDocument = {
          id: matchingNote.id,
          registry_number: matchingNote.registry_number,
          type: matchingNote.type,
        };
      }
      if (matchingNoteDetail?.reconciliation_status === DETAIL_REVIEW_STATUSES.COMPLETED || detail.accounting_status === 'CONTABILIZADO') {
        releaseStatus = 'LIBERADO';
      } else {
        releaseStatus = 'BLOQUEADO';
      }
    }

    return {
      ...detail,
      quantity_sent: sent,
      quantity_physical_received: received,
      quantity_normal_received: normalQuantity,
      quantity_blocked_difference: blockedQuantity,
      quantity_shortage_pending: isShortage ? blockedQuantity : 0,
      is_shortage: isShortage,
      quantity_held: heldQuantity,
      quantity_available: availableQuantity,
      inventory_integrity: relatedIrregularities.some(({ id_product }) => Number(id_product) === Number(detail.id_product))
        ? 'PENDIENTE_REGULARIZACION'
        : 'INTEGRA',
      receipt_difference_percentage: diffPct,
      blocked_document: blockedDocument,
      release_status: releaseStatus,
    };
  });

  const reviewNotes = (transferJson.reviewNotes || []).map((note) => ({
    ...note,
    resolutionActions: (note.resolutionActions || []).map((action) => ({
      ...action,
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS[action.strategy] || null,
      applied_effect: RECONCILIATION_SPECIFIC_EFFECTS[action.strategy] || null,
    })),
  }));

  return {
    ...transferJson,
    detailsTransfers,
    reviewNotes,
    stock_kardex_irregularities: relatedIrregularities,
    historical_difference_reconciliation: historicalDifferenceReconciliation,
  };
};

const getReviewReport = async ({ page = 1, limit = 50, status, idSucursal, productId, assignedUserId, ageFromDays, ageToDays }) => {
  const where = {
    ...(status ? { reconciliation_status: status } : {}),
    ...(idSucursal ? { id_sucursal: idSucursal } : {}),
    ...(assignedUserId ? { id_assigned_user: assignedUserId } : {}),
  };
  const dateConditions = [];
  if (ageFromDays !== undefined && ageFromDays !== null && ageFromDays !== '') {
    dateConditions.push({ [Op.lte]: new Date(Date.now() - Number(ageFromDays) * 86400000) });
  }
  if (ageToDays !== undefined && ageToDays !== null && ageToDays !== '') {
    dateConditions.push({ [Op.gte]: new Date(Date.now() - Number(ageToDays) * 86400000) });
  }
  if (dateConditions.length === 1) where.date = dateConditions[0];
  if (dateConditions.length === 2) where.date = { ...dateConditions[0], ...dateConditions[1] };
  const detailInclude = {
    association: 'details',
    required: Boolean(productId),
    where: productId ? { id_product: productId } : undefined,
    include: [
      { association: 'product', attributes: ['id', 'cod', 'name'] },
      { association: 'inventoryHolds' },
    ],
  };
  const result = await TransferReviewNote.findAndCountAll({
    where,
    include: [
      detailInclude,
      { association: 'transfer', attributes: ['id', 'cod', 'date_send', 'date_received'] },
      { association: 'sucursal', attributes: ['id', 'name'] },
      { association: 'storage', attributes: ['id', 'name'] },
      { association: 'assignedUser', attributes: ['id', 'full_names'] },
    ],
    distinct: true,
    order: [['date', 'ASC'], ['id', 'ASC']],
    limit: Math.min(Number(limit) || 50, 200),
    offset: (Math.max(Number(page) || 1, 1) - 1) * Math.min(Number(limit) || 50, 200),
  });
  return {
    total: result.count,
    data: result.rows.map((note) => ({
      ...note.toJSON(),
      age_days: Math.max(0, Math.floor((Date.now() - new Date(note.date).getTime()) / 86400000)),
    })),
  };
};

const assignReview = async ({ noteId, assignedUserId, observation, actorUserId }) => sequelize.transaction(async (transaction) => {
  const normalizedObservation = String(observation || '').trim();
  if (normalizedObservation.length < 5) {
    throw Object.assign(new Error('La observación de la derivación debe tener al menos 5 caracteres.'), { statusCode: 422 });
  }
  if (normalizedObservation.length > 500) {
    throw Object.assign(new Error('La observación de la derivación no puede superar 500 caracteres.'), { statusCode: 422 });
  }
  const [note, assignedUser] = await Promise.all([
    TransferReviewNote.findByPk(noteId, { transaction, lock: transaction.LOCK.UPDATE }),
    User.findOne({ where: { id: assignedUserId, status: true }, transaction }),
  ]);
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  if (!assignedUser) throw Object.assign(new Error('Responsable no encontrado o inactivo.'), { statusCode: 422 });
  note.id_assigned_user = assignedUser.id;
  note.assigned_at = new Date();
  await note.save({ transaction });
  const event = await createEvent(
    note.id,
    actorUserId,
    'ASIGNADA',
    `Revisión asignada a ${assignedUser.full_names}. Observación: ${normalizedObservation}`,
    {
      assigned_user_id: assignedUser.id,
      assignment_observation: normalizedObservation,
    },
    transaction,
  );
  await notificationService.notifyTransferReviewStakeholders({
    note,
    assignedUserId: assignedUser.id,
    title: `Revisión ${note.registry_number} asignada`,
    message: `La revisión fue asignada a ${assignedUser.full_names}. ${normalizedObservation}`,
    type: 'TRANSFER_REVIEW_ASSIGNED',
    eventKey: `review-assigned:${event.id}`,
  }, transaction, actorUserId);
  return note;
});

const addComment = async ({ noteId, description, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, { transaction });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  const event = await createEvent(note.id, actorUserId, 'COMENTARIO', description, {}, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Actualización ${note.registry_number}`,
    message: description,
    type: 'TRANSFER_REVIEW_UPDATED',
    eventKey: `review-comment:${event.id}`,
  }, transaction, actorUserId);
  return event;
});

const addManualAction = async ({ noteId, detailId, actionType, description, referenceType, referenceCode, productId, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    include: [{ association: 'details', attributes: ['id'] }],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  if (detailId && !note.details.some(({ id }) => Number(id) === Number(detailId))) {
    throw Object.assign(new Error('El producto seleccionado no pertenece a la nota.'), { statusCode: 422 });
  }
  const event = await createEvent(note.id, actorUserId, 'ACCION_MANUAL', description, {
    action_type: actionType,
    detail_id: detailId || null,
    reference_type: referenceType || null,
    reference_code: referenceCode || null,
    id_product: productId || null,
    id_sucursal: note.id_sucursal,
    id_storage: note.id_storage,
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Acción registrada en ${note.registry_number}`,
    message: description,
    type: 'TRANSFER_REVIEW_UPDATED',
    eventKey: `review-manual-action:${event.id}`,
  }, transaction, actorUserId);
  return event;
});

const addEvidence = async ({ noteId, evidence, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, { transaction });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  const created = await TransferReviewEvidence.create({
    ...evidence,
    id_transfer_review_note: note.id,
    id_user: actorUserId,
  }, { transaction });
  const event = await createEvent(note.id, actorUserId, 'EVIDENCIA_AGREGADA', evidence.description || 'Evidencia agregada.', { evidence_id: created.id }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Evidencia en ${note.registry_number}`,
    message: evidence.description || 'Se agregó evidencia a la revisión.',
    type: 'TRANSFER_REVIEW_UPDATED',
    eventKey: `review-evidence:${event.id}`,
  }, transaction, actorUserId);
  return created;
});

const closeReview = async ({ noteId, actorUserId }) => sequelize.transaction(async (transaction) => {
  await validateResolutionIntegrity(noteId, transaction);
  const note = await syncNoteStatus(noteId, transaction);
  if (note.reconciliation_status !== REVIEW_STATUSES.COMPLETED) {
    throw Object.assign(new Error('No se puede cerrar: existen productos pendientes de conciliación.'), { statusCode: 422 });
  }
  const differences = await stockAvailabilityService.getReviewStockKardexDifferences({ noteId, transaction });
  if (differences.length > 0) {
    const products = differences.map(({ cod, difference }) => `${cod} (diferencia ${Number(difference).toFixed(4)})`).join(', ');
    throw Object.assign(new Error(`No se puede cerrar: stock físico y Kardex aún no cuadran para ${products}.`), { statusCode: 409 });
  }
  note.resolved_at = new Date();
  note.id_resolved_user = actorUserId;
  await note.save({ transaction });
  const event = await createEvent(note.id, actorUserId, 'CERRADA', 'Revisión completada y cerrada.', {}, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Revisión ${note.registry_number} completada`,
    message: 'La revisión fue conciliada y cerrada.',
    type: 'TRANSFER_REVIEW_COMPLETED',
    level: 'INFO',
    eventKey: `review-closed:${event.id}`,
  }, transaction, actorUserId);
  return note;
});

const reopenReview = async ({ noteId, detailIds, reason, actorUserId }) => sequelize.transaction(async (transaction) => {
  const note = await TransferReviewNote.findByPk(noteId, { include: [{ association: 'details' }], transaction, lock: transaction.LOCK.UPDATE });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  const selected = Array.isArray(detailIds) && detailIds.length > 0
    ? note.details.filter(({ id }) => detailIds.includes(id))
    : note.details;
  if (selected.length === 0) throw Object.assign(new Error('No se seleccionaron detalles válidos.'), { statusCode: 422 });
  await TransferReviewNoteDetail.update({ reconciliation_status: DETAIL_REVIEW_STATUSES.IN_REVIEW, resolved_at: null, id_resolved_user: null }, {
    where: { id: selected.map(({ id }) => id) }, transaction,
  });
  note.reconciliation_status = REVIEW_STATUSES.IN_REVIEW;
  note.resolved_at = null;
  note.id_resolved_user = null;
  note.reopened_at = new Date();
  note.id_reopened_user = actorUserId;
  await note.save({ transaction });
  const event = await createEvent(note.id, actorUserId, 'REABIERTA', reason, { detail_ids: selected.map(({ id }) => id) }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note,
    title: `Revisión ${note.registry_number} reabierta`,
    message: reason,
    type: 'TRANSFER_REVIEW_REOPENED',
    level: 'DANGER',
    eventKey: `review-reopened:${event.id}`,
  }, transaction, actorUserId);
  return note;
});

module.exports = {
  deriveReconciliationStatus,
  deriveReceptionStatus,
  syncNoteStatus,
  validateResolutionIntegrity,
  createEvent,
  listOpenReviews,
  listAssignableUsers,
  getTransferTraceability,
  getReviewReport,
  assignReview,
  addComment,
  addManualAction,
  addEvidence,
  closeReview,
  reopenReview,
};

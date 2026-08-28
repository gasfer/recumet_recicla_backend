'use strict';

const { Op } = require('sequelize');
const {
  sequelize, TransferReviewNote, TransferReviewNoteDetail, TransferReviewResolutionAction,
  TransferReviewActionMovement, TransferReviewInventoryHold, User,
} = require('../database/config');
const { AUTOMATIC_RECONCILIATION_REASONS } = require('../constants/transfer-review');
const operationalDocuments = require('./reconciliation-operational-document.service');
const workflow = require('./transfer-review-workflow.service');
const notificationService = require('./notification.service');

const EPSILON = 0.0001;
const automaticError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const loadContext = async ({ noteId, detailId, transaction, lock = false }) => {
  const note = await TransferReviewNote.findByPk(noteId, {
    include: [
      { association: 'registeredProduct', attributes: ['id', 'cod', 'name'] },
      { association: 'transfer', include: [
        { association: 'sucursal_send', attributes: ['id', 'name'] },
        { association: 'sucursal_received', attributes: ['id', 'name'] },
        { association: 'storage_send', attributes: ['id', 'name'] },
        { association: 'storage_received', attributes: ['id', 'name'] },
      ] },
    ], transaction,
    ...(lock ? { lock: { level: transaction.LOCK.UPDATE, of: TransferReviewNote } } : {}),
  });
  if (!note || note.management_status !== 'ACTIVA') throw automaticError('Conciliación no encontrada o inactiva.', 404);
  const detail = await TransferReviewNoteDetail.findOne({
    where: { id: detailId, id_transfer_review_note: noteId },
    include: [{ association: 'transferDetail' }, { association: 'product', attributes: ['id', 'cod', 'name'] }],
    transaction, ...(lock ? { lock: { level: transaction.LOCK.UPDATE, of: TransferReviewNoteDetail } } : {}),
  });
  if (!detail) throw automaticError('Detalle de conciliación no encontrado.', 404);
  const pending = Math.max(0, Number(detail.quantity_difference) - Number(detail.quantity_resolved || 0));
  const activeAutomatic = await TransferReviewResolutionAction.findOne({
    where: {
      id_transfer_review_note_detail: detail.id, operation_mode: 'CREATED_AUTOMATICALLY',
      operation_status: { [Op.in]: ['PENDING_RECEPTION', 'REVERSAL_PENDING'] }, management_status: 'ACTIVA',
    }, transaction,
  });
  const registeredQuantity = Number(await TransferReviewResolutionAction.sum('quantity', {
    where: {
      id_transfer_review_note_detail: detail.id,
      management_status: 'ACTIVA',
      operation_status: { [Op.ne]: 'REVERSED' },
    },
    transaction,
  }) || 0);
  const unresolvedRegisteredQuantity = Math.max(0, registeredQuantity - Number(detail.quantity_resolved || 0));
  return { note, detail, pending, activeAutomatic, registeredQuantity, unresolvedRegisteredQuantity };
};

const buildSolutions = ({ note, detail, pending }, reasonCode = null) => {
  const transfer = note.transfer;
  const receiver = { source_sucursal_id: transfer.id_sucursal_received, source_storage_id: note.id_storage };
  const origin = { target_sucursal_id: transfer.id_sucursal_send, target_storage_id: transfer.id_storage_send };
  const confirmation = {
    code: 'CONFIRM_DIFFERENCE', label: 'Confirmar diferencia sin movimiento adicional', operation_type: 'CONFIRMATION',
    quantity: pending, product_id: note.type === 'FALTANTE_PARA_REVISION' ? note.id_product : detail.id_product,
    product: note.type === 'FALTANTE_PARA_REVISION' ? note.registeredProduct : detail.product, ...receiver,
    requires_authorizer: true, required_references: [], inventory_effect: 'NONE',
    warning: 'Se cerrará el pendiente sin crear documento ni movimiento de Kardex.',
  };
  const solutions = note.type === 'FALTANTE_PARA_REVISION' ? [
    confirmation,
    {
      code: 'CLASSIFY_SHORTAGE', label: 'Clasificar diferencia al producto faltante', operation_type: 'CLASSIFIED',
      quantity: pending, product_id: note.id_product, target_product_id: detail.id_product,
      product: note.registeredProduct, target_product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'CLASSIFICATION',
      warning: 'Se crearán la clasificación, los movimientos de stock, Kardex y la trazabilidad.',
    },
  ] : [
    confirmation,
    {
      code: 'TRANSFER_RETURN', label: 'Devolver excedente al origen', operation_type: 'TRANSFER',
      quantity: pending, product_id: detail.id_product, product: detail.product, ...receiver, ...origin,
      requires_authorizer: true, required_references: [], inventory_effect: 'TRANSFER',
      route: {
        source: transfer.sucursal_received?.name || 'Sucursal receptora',
        target: transfer.sucursal_send?.name || 'Sucursal origen',
        target_storage: transfer.storage_send?.name || 'Almacén origen',
      },
      warning: 'Se crearán la guía de devolución, los movimientos de stock, Kardex y la trazabilidad.',
    },
    {
      code: 'CLASSIFY_EXCESS', label: 'Clasificar el excedente', operation_type: 'CLASSIFIED',
      requires_target_product: true, quantity: pending, product_id: detail.id_product, product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'CLASSIFICATION',
      warning: 'Se crearán la clasificación, los movimientos de stock, Kardex y la trazabilidad.',
    },
  ];
  if (!reasonCode) return solutions;
  const allowed = AUTOMATIC_RECONCILIATION_REASONS[reasonCode]?.solutions?.[note.type] || [];
  return solutions.filter(({ code }) => allowed.includes(code));
};

const buildReasons = (noteType) => Object.entries(AUTOMATIC_RECONCILIATION_REASONS)
  .filter(([, policy]) => Array.isArray(policy.solutions[noteType]))
  .map(([code, policy]) => ({
    code,
    label: policy.label,
    solution_codes: policy.solutions[noteType],
    required_references: policy.requiredReferences,
  }));

const normalizeReferences = (references) => Array.isArray(references)
  ? references.map((reference) => ({
    document_type: String(reference?.document_type || '').trim(),
    document_number: String(reference?.document_number || '').trim(),
    document_date: String(reference?.document_date || '').trim(),
  })).filter(({ document_type, document_number }) => document_type || document_number)
  : [];

const validateReasonAndReferences = ({ noteType, reasonCode, documentReferences }) => {
  const policy = AUTOMATIC_RECONCILIATION_REASONS[reasonCode];
  if (!policy?.solutions?.[noteType]) throw automaticError('El motivo no corresponde al tipo de diferencia.');
  const references = normalizeReferences(documentReferences);
  for (const type of policy.requiredReferences) {
    const reference = references.find(({ document_type }) => document_type === type);
    if (!reference?.document_number) throw automaticError(`Complete el respaldo ${type.replaceAll('_', ' ')}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reference.document_date)) throw automaticError(`Complete una fecha válida para ${type.replaceAll('_', ' ')}.`);
  }
  return { policy, references };
};

const validateAuthorizer = async ({ authorizerUserId, sucursalId, transaction }) => {
  if (!Number.isInteger(authorizerUserId) || authorizerUserId <= 0) throw automaticError('Seleccione al Administrador o Encargado que autoriza la conciliación.');
  const authorizer = await User.findOne({
    where: { id: authorizerUserId, status: true, role: { [Op.in]: ['ADMINISTRADOR', 'ENCARGADO'] } },
    include: [
      { association: 'assign_permission', required: false, where: { module: 'TRANSFER_REVIEW', status: { [Op.ne]: false } } },
      { association: 'assign_sucursales', required: false, where: { id_sucursal: sucursalId, status: { [Op.ne]: false } } },
    ], transaction,
  });
  const allowed = authorizer && (authorizer.role === 'ADMINISTRADOR' || (
    authorizer.assign_sucursales?.length > 0
    && authorizer.assign_permission?.some(({ reports }) => reports === true)
  ));
  if (!allowed) throw automaticError('El autorizador no está activo o no tiene permiso para aprobar conciliaciones de esta sucursal.', 403);
  return authorizer;
};

const preview = async ({ noteId, detailId }) => {
  const context = await loadContext({ noteId, detailId });
  if (context.unresolvedRegisteredQuantity > EPSILON && !context.activeAutomatic) {
    return {
      status: 'REQUIRES_MANUAL',
      message: `Ya se registró una operación por ${context.registeredQuantity.toFixed(4)}, pero su estado no cerró el remanente. Falta conciliar manualmente este registro antes de crear otro.`,
      pending_quantity: context.pending,
      reasons: buildReasons(context.note.type),
      solutions: [],
    };
  }
  if (context.pending <= EPSILON || context.activeAutomatic) {
    return context.activeAutomatic?.operation_status === 'PENDING_RECEPTION'
      ? { status: 'PENDING_OPERATION', message: 'La conciliación ya creó un traslado y está pendiente de recepción.', pending_quantity: context.pending, reasons: [], solutions: [] }
      : { status: 'ALREADY_RECONCILED', message: 'Ya se registró esta conciliación.', pending_quantity: 0, reasons: [], solutions: [] };
  }
  return {
    status: 'READY', detail_version: Number(context.detail.updatedAt?.getTime?.() || 1),
    pending_quantity: context.pending, reasons: buildReasons(context.note.type), solutions: buildSolutions(context),
    warning: 'Confirme la diferencia o seleccione una operación. Devolución y clasificación crearán documento, stock, Kardex e historial.',
  };
};

const settleDetail = async ({ context, quantity, actorUserId, transaction }) => {
  const hold = await TransferReviewInventoryHold.findOne({
    where: { id_transfer_review_note_detail: context.detail.id, disposition: 'EN_REVISION' }, transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!hold || Number(hold.quantity) + EPSILON < quantity) throw automaticError('La retención disponible no coincide con el remanente.', 409);
  const left = Number(hold.quantity) - quantity;
  if (left <= EPSILON) await hold.destroy({ transaction }); else { hold.quantity = left; await hold.save({ transaction }); }
  const released = await TransferReviewInventoryHold.findOne({ where: { id_transfer_review_note_detail: context.detail.id, disposition: 'LIBERADO_POR_AJUSTE' }, transaction, lock: transaction.LOCK.UPDATE });
  if (released) { released.quantity = Number(released.quantity) + quantity; await released.save({ transaction }); }
  else await TransferReviewInventoryHold.create({
    id_transfer_review_note_detail: context.detail.id, id_product: hold.id_product,
    id_sucursal: hold.id_sucursal, id_storage: hold.id_storage,
    id_created_user: actorUserId, quantity, disposition: 'LIBERADO_POR_AJUSTE',
  }, { transaction });
  context.detail.quantity_resolved = Number(context.detail.quantity_resolved || 0) + quantity;
  const pendingAfter = Math.max(0, Number(context.detail.quantity_difference) - Number(context.detail.quantity_resolved));
  if (pendingAfter <= EPSILON) {
    context.detail.quantity_resolved = context.detail.quantity_difference;
    context.detail.reconciliation_status = 'COMPLETADO'; context.detail.resolved_at = new Date(); context.detail.id_resolved_user = actorUserId;
  } else context.detail.reconciliation_status = 'PARCIAL';
  await context.detail.save({ transaction });
  const syncedNote = await workflow.syncNoteStatus(context.note.id, transaction);
  if (syncedNote.reconciliation_status === 'COMPLETADO') { syncedNote.resolved_at = new Date(); syncedNote.id_resolved_user = actorUserId; await syncedNote.save({ transaction }); }
  return { pendingAfter, syncedNote };
};

const confirm = async ({
  noteId, detailId, solutionCode, targetProductId, reasonCode, justification,
  documentReferences, authorizerUserId, detailVersion, quantity, idempotencyKey, actorUserId,
}) => sequelize.transaction(async (transaction) => {
  const existing = await TransferReviewResolutionAction.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
  if (existing) return { action: existing, idempotent: true };
  const context = await loadContext({ noteId, detailId, transaction, lock: true });
  if (context.unresolvedRegisteredQuantity > EPSILON && !context.activeAutomatic) {
    throw automaticError('Ya se registró una operación, pero falta conciliar manualmente su estado antes de crear otra.', 409);
  }
  if (context.pending <= EPSILON || context.activeAutomatic) throw automaticError('Ya se registró esta conciliación.', 409);
  const currentVersion = Number(context.detail.updatedAt?.getTime?.() || 1);
  if (!Number.isFinite(detailVersion) || detailVersion !== currentVersion) {
    throw automaticError('La conciliación cambió después de la previsualización. Actualice los datos antes de confirmar.', 409);
  }
  if (String(justification || '').trim().length < 10) throw automaticError('Escriba una justificación operativa de al menos 10 caracteres.');
  const { references } = validateReasonAndReferences({ noteType: context.note.type, reasonCode, documentReferences });
  const authorizer = await validateAuthorizer({ authorizerUserId, sucursalId: context.note.id_sucursal, transaction });
  const requested = Number(quantity || context.pending);
  if (!Number.isFinite(requested) || requested <= EPSILON || requested - context.pending > EPSILON) throw automaticError('Cantidad inválida para el remanente actual.');
  const solution = buildSolutions(context, reasonCode).find(({ code }) => code === solutionCode);
  if (!solution) throw automaticError('La solución seleccionada no corresponde al motivo comprobado.');
  const command = {
    productId: solution.product_id,
    targetProductId: solution.requires_target_product ? Number(targetProductId) : (solution.target_product_id || null),
    quantity: requested, cost: Number(context.detail.transferDetail?.cost || 0),
    sourceSucursalId: solution.source_sucursal_id, sourceStorageId: solution.source_storage_id,
    targetSucursalId: solution.target_sucursal_id, targetStorageId: solution.target_storage_id,
    observations: `CONCILIACIÓN ${context.note.registry_number} - ${reasonCode}: ${String(justification).trim()}`,
    heldAllowance: solution.operation_type === 'CLASSIFIED' || solution.code === 'TRANSFER_RETURN' ? requested : 0,
  };
  if (solution.requires_target_product && (!command.targetProductId || !Number.isInteger(command.targetProductId))) {
    throw automaticError('Seleccione el producto destino de la clasificación.');
  }
  if (solution.operation_type === 'CLASSIFIED' && command.targetProductId === command.productId) {
    throw automaticError('El producto destino debe ser diferente del producto que se clasifica.');
  }
  const operation = solution.operation_type === 'TRANSFER'
    ? await operationalDocuments.createTransfer({ command, actorUserId, transaction })
    : solution.operation_type === 'CLASSIFIED'
      ? await operationalDocuments.createClassification({ command, actorUserId, transaction })
      : { type: 'CONFIRMATION', document: { id: null, cod: context.note.registry_number }, movements: [] };
  const action = await TransferReviewResolutionAction.create({
    idempotency_key: idempotencyKey, strategy: solutionCode, quantity: requested,
    observations: command.observations, id_transfer_review_note: context.note.id,
    id_transfer_review_note_detail: context.detail.id, id_user: actorUserId,
    id_approved_user: authorizer.id, approved_at: new Date(),
    operation_mode: 'CREATED_AUTOMATICALLY', operation_type: operation.type,
    operation_id: operation.document.id, operation_status: 'ACTIVE',
    detail_version: Number(context.detail.updatedAt?.getTime?.() || 1),
  }, { transaction });
  context.detail.cause = reasonCode;
  for (const movement of operation.movements) await TransferReviewActionMovement.create({
    id_transfer_review_resolution_action: action.id, id_kardex_movement: movement.id, movement_role: 'ORIGINAL',
  }, { transaction });
  const pendingReception = false;
  const settled = pendingReception
    ? { pendingAfter: context.pending, syncedNote: context.note }
    : await settleDetail({ context, quantity: requested, actorUserId, transaction });
  const { pendingAfter, syncedNote } = settled;
  const event = await workflow.createEvent(context.note.id, actorUserId, 'CONCILIACION_AUTOMATICA', operation.type === 'CONFIRMATION'
    ? 'Diferencia confirmada sin movimiento adicional de inventario.'
    : `Operación ${operation.type} #${operation.document.cod} creada automáticamente.`, {
    action_id: action.id, detail_id: context.detail.id, operation_type: operation.type,
    operation_id: operation.document.id, movement_ids: operation.movements.map(({ id }) => id), pending_after: pendingAfter,
    reason_code: reasonCode, operational_justification: String(justification).trim(),
    document_references: references, executor_user_id: actorUserId, authorizer_user_id: authorizer.id,
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note: syncedNote, title: `Conciliación automática ${context.note.registry_number}`,
    message: operation.type === 'CONFIRMATION'
      ? 'La diferencia fue confirmada sin crear otro movimiento de inventario.'
      : `Se creó ${operation.type} #${operation.document.cod} sin registros manuales.`,
    type: 'TRANSFER_REVIEW_AUTOMATED', level: pendingAfter <= EPSILON ? 'INFO' : 'WARNING', eventKey: `automatic-resolution:${event.id}`,
  }, transaction, actorUserId);
  return { action, operation: { type: operation.type, id: operation.document.id, code: operation.document.cod }, pending_quantity: pendingAfter, pending_reception: pendingReception, idempotent: false };
}).catch((error) => {
  if (error?.name === 'SequelizeUniqueConstraintError') {
    throw automaticError('Ya se registró esta conciliación. No se creó un registro duplicado.', 409);
  }
  throw error;
});

const completePendingTransfer = async ({ transferId, actorUserId, transaction }) => {
  const action = await TransferReviewResolutionAction.findOne({
    where: { operation_type: 'TRANSFER', operation_id: transferId, operation_status: 'PENDING_RECEPTION', management_status: 'ACTIVA' },
    transaction, lock: transaction.LOCK.UPDATE,
  });
  if (!action) return null;
  const context = await loadContext({ noteId: action.id_transfer_review_note, detailId: action.id_transfer_review_note_detail, transaction, lock: true });
  const settled = await settleDetail({ context, quantity: Number(action.quantity), actorUserId, transaction });
  action.operation_status = 'ACTIVE'; await action.save({ transaction });
  await workflow.createEvent(context.note.id, actorUserId, 'TRASLADO_CORRECTIVO_RECIBIDO', 'El traslado automático fue recibido y completó la conciliación.', {
    action_id: action.id, operation_id: transferId, pending_after: settled.pendingAfter,
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note: settled.syncedNote, title: `Conciliación ${context.note.registry_number} completada`,
    message: 'El traslado correctivo fue recibido y la diferencia quedó conciliada.',
    type: 'TRANSFER_REVIEW_AUTOMATED_RECEIVED', level: 'INFO', eventKey: `automatic-transfer-received:${action.id}`,
  }, transaction, actorUserId);
  return { action, pending_quantity: settled.pendingAfter };
};

module.exports = { preview, confirm, completePendingTransfer };

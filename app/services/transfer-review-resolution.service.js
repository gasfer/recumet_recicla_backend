'use strict';

const {
  sequelize,
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewResolutionAction,
  TransferReviewActionMovement,
  TransferReviewEvidence,
  TransferReviewEvent,
  Product,
  History,
} = require('../database/config');
const { DETAIL_REVIEW_STATUSES, REVIEW_STATUSES } = require('../constants/transfer-review');
const { createEvent, syncNoteStatus } = require('./transfer-review-workflow.service');
const notificationService = require('./notification.service');
const { applyExplicitEffect } = require('./inventory-posting.service');
const integrityService = require('./stock-kardex-integrity.service');

const EXCESS_STRATEGIES = new Set([
  'ORIGEN_ENVIO_MAYOR',
  'ERROR_RECEPCION',
  'PRODUCTO_INCORRECTO',
  'FUENTE_EXTERNA',
  'TOLERANCIA_AUTORIZADA',
  'ACCION_MANUAL_VERIFICADA',
]);
const SHORTAGE_STRATEGIES = new Set([
  'FALTANTE_LOCALIZADO',
  'PERDIDA_CONFIRMADA',
  'ERROR_MEDICION_FALTANTE',
  'RECLASIFICACION',
  'ACCION_MANUAL_VERIFICADA',
]);
const APPROVAL_REQUIRED = new Set(['FUENTE_EXTERNA', 'TOLERANCIA_AUTORIZADA', 'PERDIDA_CONFIRMADA', 'ACCION_MANUAL_VERIFICADA']);
const EVIDENCE_REQUIRED = new Set(['FUENTE_EXTERNA', 'TOLERANCIA_AUTORIZADA', 'PERDIDA_CONFIRMADA']);
const { permissionDeniedError } = require('../helpers/permission-denied');

const workflowError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const applyResolutionEffect = async ({ type, quantity, productId, sucursalId, storageId, userId, note, strategy, actionId, transaction }) => {
  const result = await applyExplicitEffect({
    direction: type,
    quantity,
    productId,
    sucursalId,
    storageId,
    actorUserId: userId,
    date: new Date(),
    details: `CONCILIACIÓN ${strategy} ${note.registry_number}`,
    registryNumber: note.registry_number,
    sourceType: 'TRANSFER_REVIEW_LEGACY_RESOLUTION',
    sourceId: actionId,
    sourceDetailId: `${type}:${productId}`,
    effectType: strategy,
    idempotencyKey: `TRANSFER_REVIEW_LEGACY:${actionId}:${type}:${productId}`,
    transaction,
  });
  return result.movement;
};

const linkMovements = async (actionId, movements, transaction) => {
  if (movements.length === 0) return;
  await TransferReviewActionMovement.bulkCreate(movements.map(({ id }) => ({
    id_transfer_review_resolution_action: actionId,
    id_kardex_movement: id,
  })), { transaction });
};

const assertStrategy = (note, strategy) => {
  const allowed = note.type === 'EXCEDENTE_PARA_REVISION' ? EXCESS_STRATEGIES : SHORTAGE_STRATEGIES;
  if (!allowed.has(strategy)) throw workflowError(`La estrategia ${strategy} no corresponde al tipo de diferencia.`);
};

const assertTargetProduct = async (targetProductId, transaction) => {
  const product = await Product.findOne({ where: { id: targetProductId, status: true }, transaction });
  if (!product) throw workflowError('El producto destino no existe o está inactivo.');
  return product;
};

const applyExcessStrategy = async ({ strategy, quantity, detail, note, targetProductId, userId, actionId, transaction }) => {
  const movements = [];
  if (strategy === 'ACCION_MANUAL_VERIFICADA') return movements;
  const destination = { sucursalId: note.id_sucursal, storageId: note.id_storage };
  if (strategy === 'ORIGEN_ENVIO_MAYOR') {
    movements.push(await applyResolutionEffect({ type: 'OUTPUT', quantity, productId: note.id_product, sucursalId: note.transfer.id_sucursal_send, storageId: note.transfer.id_storage_send, userId, note, strategy, actionId, transaction }));
  } else if (strategy === 'ERROR_RECEPCION') {
    movements.push(await applyResolutionEffect({ type: 'OUTPUT', quantity, productId: note.id_product, ...destination, userId, note, strategy, actionId, transaction }));
  } else if (strategy === 'PRODUCTO_INCORRECTO') {
    await assertTargetProduct(targetProductId, transaction);
    if (Number(targetProductId) === Number(note.id_product)) throw workflowError('El producto correcto debe ser diferente del producto observado.');
    movements.push(await applyResolutionEffect({ type: 'OUTPUT', quantity, productId: note.id_product, ...destination, userId, note, strategy, actionId, transaction }));
    movements.push(await applyResolutionEffect({ type: 'INPUT', quantity, productId: targetProductId, ...destination, userId, note, strategy, actionId, transaction }));
  }
  return movements;
};

const applyShortageStrategy = async ({ strategy, quantity, detail, note, targetProductId, userId, actionId, transaction }) => {
  const movements = [];
  if (strategy === 'ACCION_MANUAL_VERIFICADA') return movements;
  const destination = { sucursalId: note.id_sucursal, storageId: note.id_storage };
  const differenceProductId = note.id_product;
  const incomingProductId = strategy === 'RECLASIFICACION' ? Number(targetProductId) : detail.id_product;
  if (strategy === 'RECLASIFICACION') await assertTargetProduct(incomingProductId, transaction);

  movements.push(await applyResolutionEffect({ type: 'OUTPUT', quantity, productId: differenceProductId, ...destination, userId, note, strategy, actionId, transaction }));

  if (strategy !== 'PERDIDA_CONFIRMADA') {
    movements.push(await applyResolutionEffect({ type: 'INPUT', quantity, productId: incomingProductId, ...destination, userId, note, strategy, actionId, transaction }));
  }
  return movements;
};

const affectedLocations = ({ note, detail, strategy, targetProductId }) => {
  const destination = { sucursalId: note.id_sucursal, storageId: note.id_storage };
  if (strategy === 'ACCION_MANUAL_VERIFICADA') return [];
  if (note.type === 'EXCEDENTE_PARA_REVISION') {
    if (strategy === 'ORIGEN_ENVIO_MAYOR') return [{
      productId: note.id_product,
      sucursalId: note.transfer.id_sucursal_send,
      storageId: note.transfer.id_storage_send,
    }];
    if (strategy === 'PRODUCTO_INCORRECTO') return [
      { productId: note.id_product, ...destination },
      { productId: targetProductId, ...destination },
    ];
    return [{ productId: note.id_product, ...destination }];
  }
  const locations = [{ productId: note.id_product, ...destination }];
  if (strategy !== 'PERDIDA_CONFIRMADA') {
    locations.push({ productId: strategy === 'RECLASIFICACION' ? targetProductId : detail.id_product, ...destination });
  }
  return locations;
};

const resolveReviewDetail = async ({ noteId, detailId, strategy, quantity, cause, observations, targetProductId, idempotencyKey, actorUserId, actorCanApprove }) => {
  if (!idempotencyKey) throw workflowError('La clave de idempotencia es obligatoria.');
  const requestedQuantity = Number(quantity);
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) throw workflowError('La cantidad a conciliar debe ser mayor a cero.');

  return sequelize.transaction(async (transaction) => {
    const existing = await TransferReviewResolutionAction.findOne({
      where: { idempotency_key: idempotencyKey },
      include: [{ association: 'movementLinks', include: [{ association: 'kardexMovement' }] }],
      transaction,
    });
    if (existing) return { action: existing, idempotent: true };

    const detail = await TransferReviewNoteDetail.findOne({
      where: { id: detailId, id_transfer_review_note: noteId },
      include: [{ association: 'reviewNote', include: [{ association: 'transfer' }] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!detail) throw workflowError('Detalle de revisión no encontrado.', 404);
    const note = detail.reviewNote;
    assertStrategy(note, strategy);
    if (APPROVAL_REQUIRED.has(strategy) && !actorCanApprove) throw permissionDeniedError('aprobar esta estrategia de conciliación');
    if (EVIDENCE_REQUIRED.has(strategy)) {
      const evidenceCount = await TransferReviewEvidence.count({ where: { id_transfer_review_note: note.id }, transaction });
      if (evidenceCount === 0) throw workflowError('Esta estrategia requiere evidencia registrada antes de aprobarse.');
    }
    if (strategy === 'ACCION_MANUAL_VERIFICADA') {
      const manualEvents = await TransferReviewEvent.findAll({
        where: { id_transfer_review_note: note.id, event_type: 'ACCION_MANUAL' },
        transaction,
      });
      const referencedAction = manualEvents.find(({ metadata }) => (
        (!metadata?.detail_id || Number(metadata.detail_id) === Number(detail.id))
        && metadata?.reference_code
      ));
      if (!referencedAction) {
        throw workflowError('La conciliación manual requiere una acción previa con referencia verificable.');
      }
    }

    const pendingQuantity = Number(detail.quantity_difference) - Number(detail.quantity_resolved || 0);
    if (requestedQuantity > pendingQuantity) throw workflowError(`La cantidad excede el pendiente de ${pendingQuantity}.`);

    const action = await TransferReviewResolutionAction.create({
      idempotency_key: idempotencyKey,
      strategy,
      quantity: requestedQuantity,
      observations,
      approved_at: APPROVAL_REQUIRED.has(strategy) ? new Date() : null,
      id_transfer_review_note: note.id,
      id_transfer_review_note_detail: detail.id,
      id_user: actorUserId,
      id_approved_user: APPROVAL_REQUIRED.has(strategy) ? actorUserId : null,
    }, { transaction });

    if (strategy === 'PRODUCTO_INCORRECTO' || strategy === 'RECLASIFICACION') {
      await assertTargetProduct(targetProductId, transaction);
    }
    const locations = affectedLocations({ note, detail, strategy, targetProductId });
    const beforeDiagnostics = [];
    for (const location of integrityService.uniqueSortedLocations(locations)) {
      beforeDiagnostics.push(await integrityService.getStockKardexIntegrity({ ...location, transaction }));
    }
    const common = { strategy, quantity: requestedQuantity, detail, note, targetProductId, userId: actorUserId, actionId: action.id, transaction };
    const movements = note.type === 'EXCEDENTE_PARA_REVISION'
      ? await applyExcessStrategy(common)
      : await applyShortageStrategy(common);
    await linkMovements(action.id, movements, transaction);
    await integrityService.verifyLocationsIntegrityPreserved({ locations, beforeDiagnostics, transaction });

    detail.quantity_resolved = Number(detail.quantity_resolved || 0) + requestedQuantity;
    detail.cause = cause || strategy;
    if (Number(detail.quantity_resolved) === Number(detail.quantity_difference)) {
      detail.reconciliation_status = DETAIL_REVIEW_STATUSES.COMPLETED;
      detail.resolved_at = new Date();
      detail.id_resolved_user = actorUserId;
    }
    await detail.save({ transaction });
    const syncedNote = await syncNoteStatus(note.id, transaction);
    const event = await createEvent(note.id, actorUserId, 'RESOLUCION_APLICADA', `Se conciliaron ${requestedQuantity} mediante ${strategy}.`, {
      action_id: action.id,
      detail_id: detail.id,
      strategy,
      quantity: requestedQuantity,
      movement_ids: movements.map(({ id }) => id),
      target_product_id: targetProductId || null,
    }, transaction);
    await History.create({
      id_user: actorUserId,
      description: `RESOLVIÓ NOTA DE RECEPCIÓN ${note.registry_number} · ${strategy} · ${requestedQuantity} kg.`,
      type: 'RESOLUCIÓN NOTA RECEPCIÓN',
      module: 'TRANSFER_REVIEW',
      action: 'UPDATE',
      id_sucursal: note.id_sucursal,
      id_reference: note.id,
      status: true,
    }, { transaction });
    await notificationService.notifyTransferReviewStakeholders({
      note: syncedNote,
      title: `Conciliación ${note.registry_number}`,
      message: syncedNote.reconciliation_status === REVIEW_STATUSES.COMPLETED
        ? `Las cantidades están conciliadas. Falta verificar stock–Kardex y guardar la revisión como resuelta.`
        : `Se conciliaron ${requestedQuantity} mediante ${strategy}. Estado: ${syncedNote.reconciliation_status}.`,
      type: syncedNote.reconciliation_status === REVIEW_STATUSES.COMPLETED ? 'TRANSFER_REVIEW_READY_TO_CLOSE' : 'TRANSFER_REVIEW_UPDATED',
      level: 'WARNING',
      eventKey: `review-resolution:${event.id}`,
    }, transaction, actorUserId);
    return { action, note: syncedNote, detail, movements, idempotent: false };
  });
};

module.exports = {
  EXCESS_STRATEGIES,
  SHORTAGE_STRATEGIES,
  APPROVAL_REQUIRED,
  EVIDENCE_REQUIRED,
  affectedLocations,
  resolveReviewDetail,
};

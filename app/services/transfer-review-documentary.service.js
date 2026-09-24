'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewInventoryHold,
  TransferReviewResolutionAction,
  TransferReviewEvidence,
  User,
} = require('../database/config');
const {
  REVIEW_STATUSES,
  DETAIL_REVIEW_STATUSES,
  REVIEW_HOLD_DISPOSITIONS,
  DOCUMENTARY_REVIEW_REASONS,
  DOCUMENTARY_REVIEW_OUTCOMES,
} = require('../constants/transfer-review');
const { createEvent, syncNoteStatus } = require('./transfer-review-workflow.service');
const operationalVerificationService = require('./transfer-review-operational-verification.service');
const stockKardexIntegrity = require('./stock-kardex-integrity.service');
const notificationService = require('./notification.service');

const EPSILON = 0.0001;
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/La_Paz';

const workflowError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const currentBusinessDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valueByType = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`;
};

const normalizeQuantity = (value, pendingQuantity) => {
  if (value === undefined || value === null || value === '') return pendingQuantity;
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) throw workflowError('La cantidad a conciliar debe ser mayor a cero.');
  if (quantity - pendingQuantity > EPSILON) throw workflowError(`La cantidad excede el pendiente de ${pendingQuantity}.`);
  return quantity;
};

const validateReason = (reviewType, reasonCode, noteOrReference) => {
  const policy = DOCUMENTARY_REVIEW_REASONS[reviewType]?.[reasonCode];
  if (!policy) throw workflowError('El motivo documental no corresponde al tipo de diferencia.');
  if (!noteOrReference) throw workflowError('Debe registrar una nota o referencia verificable.');
  if (reasonCode === 'OTRO' && noteOrReference.length < 8) {
    throw workflowError('Describa el otro motivo con mayor precisión.');
  }
  return policy;
};

const normalizeDocumentReferences = (references, requiredTypes = [], alternativeTypes = []) => {
  if (!Array.isArray(references)) {
    if (requiredTypes.length === 0 && alternativeTypes.length === 0) return [];
    throw workflowError('Debe registrar el número del respaldo relacionado.');
  }

  const reconciliationDate = currentBusinessDate();

  const normalized = references.map((reference) => ({
    document_type: String(reference?.document_type || '').trim(),
    document_number: String(reference?.document_number || '').trim(),
    document_date: String(reference?.document_date || reconciliationDate).trim(),
  }));
  const referencesByType = new Map(normalized.map((reference) => [reference.document_type, reference]));

  const validateReference = (reference, type) => {
    if (!reference?.document_number) {
      throw workflowError(`Complete el número de ${type.replaceAll('_', ' ')}.`);
    }
    if (reference.document_number.length > 100) {
      throw workflowError(`El número de ${type.replaceAll('_', ' ')} es demasiado largo.`);
    }
    const parsedDate = new Date(`${reference.document_date}T00:00:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(reference.document_date)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== reference.document_date
    ) {
      throw workflowError(`La fecha de ${type.replaceAll('_', ' ')} no es válida.`);
    }
    return reference;
  };

  for (const reference of normalized) {
    if (reference.document_type || reference.document_number) {
      if (!reference.document_type) throw workflowError('Seleccione el tipo de regularización realizada.');
      validateReference(reference, reference.document_type);
    }
  }

  for (const requiredType of requiredTypes) {
    validateReference(referencesByType.get(requiredType), requiredType);
  }

  const selectedAlternative = alternativeTypes
    .map((type) => referencesByType.get(type))
    .find((reference) => reference?.document_number);
  if (alternativeTypes.length && !selectedAlternative) {
    throw workflowError('Seleccione el tratamiento aplicado y registre el número de nota.');
  }
  if (selectedAlternative) validateReference(selectedAlternative, selectedAlternative.document_type);

  return normalized.filter(({ document_type, document_number }) => document_type && document_number);
};

const registerInlineEvidence = async ({ noteId, actorUserId, evidence, transaction }) => {
  if (!evidence) return null;
  const evidenceType = String(evidence.evidence_type || '').trim();
  const description = String(evidence.description || '').trim();
  const fileUrl = String(evidence.file_url || '').trim();
  if (!evidenceType || (!description && !fileUrl)) {
    throw workflowError('La evidencia requiere tipo y archivo o descripción.');
  }
  return TransferReviewEvidence.create({
    evidence_type: evidenceType,
    description: description || null,
    file_url: fileUrl || null,
    file_name: evidence.file_name || null,
    checksum: evidence.checksum || null,
    id_transfer_review_note: noteId,
    id_user: actorUserId,
  }, { transaction });
};

const documentaryCloseDetail = async ({
  noteId,
  detailId,
  reasonCode,
  noteOrReference,
  documentReferences,
  operationalJustification,
  authorizerUserId,
  quantity,
  evidence,
  idempotencyKey,
  actorUserId,
}) => {
  if (!idempotencyKey) throw workflowError('La clave de idempotencia es obligatoria.');
  const normalizedReference = String(noteOrReference || '').trim();

  return sequelize.transaction(async (transaction) => {
    const existingAction = await TransferReviewResolutionAction.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction,
    });
    if (existingAction) return { action: existingAction, idempotent: true };

    const detail = await TransferReviewNoteDetail.findOne({
      where: { id: detailId, id_transfer_review_note: noteId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!detail) throw workflowError('Detalle de revisión no encontrado.', 404);

    const note = await TransferReviewNote.findByPk(noteId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!note) throw workflowError('Nota de revisión no encontrada.', 404);
    const previousDetailStatus = detail.reconciliation_status;
    const reasonPolicy = validateReason(note.type, reasonCode, normalizedReference);
    const normalizedReferences = normalizeDocumentReferences(
      documentReferences,
      reasonPolicy.requiredReferences || [],
      reasonPolicy.requiredReferenceAlternatives || [],
    );
    const normalizedJustification = String(operationalJustification || '').trim();
    if ((reasonPolicy.requiredReferences?.length || reasonPolicy.requiredReferenceAlternatives?.length) && normalizedJustification.length < 10) {
      throw workflowError('Describa la justificación operativa con al menos 10 caracteres.');
    }
    let authorizer = null;
    if (reasonPolicy.requiresAuthorizer) {
      if (!authorizerUserId) throw workflowError('Seleccione al responsable que autoriza la conciliación.');
      authorizer = await User.findOne({
        where: { id: authorizerUserId, status: true, role: { [Op.in]: ['ADMINISTRADOR', 'ENCARGADO'] } },
        transaction,
      });
      if (!authorizer) throw workflowError('El responsable autorizador no está activo o no tiene un rol autorizado.');
    }
    const pendingBefore = Number(detail.quantity_difference) - Number(detail.quantity_resolved || 0);
    if (pendingBefore <= EPSILON) throw workflowError('La diferencia ya fue conciliada.', 409);
    const requestedQuantity = normalizeQuantity(quantity, pendingBefore);

    const operationalResolution = await operationalVerificationService.verifyOperationalResolution({
      note,
      detail,
      references: normalizedReferences,
      quantity: requestedQuantity,
      transaction,
    });
    const integrity = await stockKardexIntegrity.verifyLocationsIntegrity({
      locations: operationalResolution.affectedLocations || [{
        productId: detail.id_product,
        sucursalId: note.id_sucursal,
        storageId: note.id_storage,
      }],
      transaction,
    });

    const holds = await TransferReviewInventoryHold.findAll({
      where: {
        id_transfer_review_note_detail: detail.id,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const inReviewHold = holds.find(({ disposition }) => disposition === REVIEW_HOLD_DISPOSITIONS.IN_REVIEW);
    if (!inReviewHold || Number(inReviewHold.quantity) + EPSILON < requestedQuantity) {
      throw workflowError('La retención pendiente no cubre la cantidad solicitada.', 409);
    }

    const inlineEvidence = await registerInlineEvidence({ noteId: note.id, actorUserId, evidence, transaction });
    if (reasonPolicy.requiresEvidence && !inlineEvidence) {
      const evidenceCount = await TransferReviewEvidence.count({
        where: { id_transfer_review_note: note.id },
        transaction,
      });
      if (evidenceCount === 0) throw workflowError('Este motivo requiere evidencia registrada.');
    }

    const retainedHold = holds.find(({ disposition }) => disposition === REVIEW_HOLD_DISPOSITIONS.RETAINED_WITHOUT_ADJUSTMENT);
    if (retainedHold && Number(retainedHold.quantity) > EPSILON) {
      throw workflowError('Esta diferencia contiene una retención histórica sin regularización verificada. Requiere revisión administrativa antes de cerrarla.', 409);
    }
    const releasedHold = holds.find(({ disposition }) => disposition === REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT);
    const inReviewAfter = Number(inReviewHold.quantity) - requestedQuantity;
    if (inReviewAfter <= EPSILON) await inReviewHold.destroy({ transaction });
    else {
      inReviewHold.quantity = inReviewAfter;
      await inReviewHold.save({ transaction });
    }
    if (releasedHold) {
      releasedHold.quantity = Number(releasedHold.quantity) + requestedQuantity;
      await releasedHold.save({ transaction });
    } else {
      await TransferReviewInventoryHold.create({
        quantity: requestedQuantity,
        disposition: REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT,
        id_transfer_review_note_detail: detail.id,
        id_product: inReviewHold.id_product,
        id_sucursal: inReviewHold.id_sucursal,
        id_storage: inReviewHold.id_storage,
        id_created_user: actorUserId,
      }, { transaction });
    }

    if (!note.id_assigned_user) {
      note.id_assigned_user = actorUserId;
      note.assigned_at = new Date();
      await note.save({ transaction });
      await createEvent(note.id, actorUserId, 'ASIGNADA_AUTOMATICAMENTE', 'Responsable asignado al iniciar la conciliación documental.', {
        assigned_user_id: actorUserId,
      }, transaction);
    }

    const outcome = DOCUMENTARY_REVIEW_OUTCOMES[note.type];
    const action = await TransferReviewResolutionAction.create({
      idempotency_key: idempotencyKey,
      strategy: outcome,
      quantity: requestedQuantity,
      observations: normalizedJustification
        ? `${normalizedJustification}\nReferencias: ${normalizedReference}`
        : normalizedReference,
      id_transfer_review_note: note.id,
      id_transfer_review_note_detail: detail.id,
      id_user: actorUserId,
      id_approved_user: authorizer?.id || null,
      approved_at: authorizer ? new Date() : null,
      operation_mode: 'VERIFIED_EXISTING',
      operation_type: operationalResolution.documentType,
      operation_id: operationalResolution.documentId,
      operation_status: 'ACTIVE',
      detail_version: Number(detail.updatedAt?.getTime?.() || 1),
    }, { transaction });

    detail.quantity_resolved = Number(detail.quantity_resolved || 0) + requestedQuantity;
    detail.cause = reasonCode;
    const pendingAfter = Math.max(0, Number(detail.quantity_difference) - Number(detail.quantity_resolved));
    if (pendingAfter <= EPSILON) {
      detail.quantity_resolved = Number(detail.quantity_difference);
      detail.reconciliation_status = DETAIL_REVIEW_STATUSES.COMPLETED;
      detail.resolved_at = new Date();
      detail.id_resolved_user = actorUserId;
    }
    await detail.save({ transaction });

    const activeHolds = await TransferReviewInventoryHold.findAll({
      where: {
        id_transfer_review_note_detail: detail.id,
        disposition: { [Op.ne]: REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const activeHoldTotal = activeHolds.reduce((total, hold) => total + Number(hold.quantity), 0);
    const releasedHoldTotal = Number(detail.quantity_resolved || 0);
    const expectedActiveHoldTotal = Math.max(0, Number(detail.quantity_difference) - releasedHoldTotal);
    if (Math.abs(activeHoldTotal - expectedActiveHoldTotal) > EPSILON) {
      throw workflowError('Las retenciones activas no coinciden con la cantidad pendiente.', 409);
    }

    const resolutionEvent = await createEvent(note.id, actorUserId, 'SIN_AJUSTE_INVENTARIO', `Regularización verificada mediante ${reasonCode}.`, {
      action_id: action.id,
      detail_id: detail.id,
      outcome,
      reason_code: reasonCode,
      quantity: requestedQuantity,
      note_or_reference: normalizedReference,
      document_references: normalizedReferences,
      operational_justification: normalizedJustification || null,
      executor_user_id: actorUserId,
      authorizer_user_id: authorizer?.id || null,
      assigned_user_id: note.id_assigned_user || actorUserId,
      evidence_ids: inlineEvidence ? [inlineEvidence.id] : [],
      original_kardex_movement_id: note.id_kardex_movement,
      id_product: inReviewHold.id_product,
      id_sucursal: inReviewHold.id_sucursal,
      id_storage: inReviewHold.id_storage,
      disposition: REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT,
      inventory_effect: 'VERIFIED_EXISTING_OPERATION',
      operational_verification: true,
      operational_document_type: operationalResolution.documentType,
      operational_document_id: operationalResolution.documentId,
      operational_document_number: operationalResolution.documentNumber,
      operational_document_quantity: operationalResolution.documentQuantity,
      integrity,
      previous_status: previousDetailStatus,
      current_status: detail.reconciliation_status,
      pending_before: pendingBefore,
      pending_after: pendingAfter,
    }, transaction);

    const syncedNote = await syncNoteStatus(note.id, transaction);
    let closedAutomatically = false;
    if (syncedNote.reconciliation_status === REVIEW_STATUSES.COMPLETED) {
      syncedNote.resolved_at = new Date();
      syncedNote.id_resolved_user = actorUserId;
      await syncedNote.save({ transaction });
      await createEvent(note.id, actorUserId, 'CERRADA_DOCUMENTALMENTE', 'Revisión cerrada después de verificar todas las regularizaciones.', {
        inventory_effect: 'VERIFIED_EXISTING_OPERATION',
        disposition: REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT,
      }, transaction);
      closedAutomatically = true;
    }

    await notificationService.notifyTransferReviewStakeholders({
      note: syncedNote,
      title: closedAutomatically ? `Revisión ${note.registry_number} cerrada` : `Conciliación ${note.registry_number}`,
      message: closedAutomatically
        ? 'La revisión fue cerrada porque todas las diferencias tienen una regularización verificada.'
        : `Se verificaron ${requestedQuantity}; todavía quedan diferencias pendientes.`,
      type: closedAutomatically ? 'TRANSFER_REVIEW_COMPLETED' : 'TRANSFER_REVIEW_UPDATED',
      level: closedAutomatically ? 'INFO' : 'WARNING',
      eventKey: `review-documentary-resolution:${resolutionEvent.id}`,
    }, transaction, actorUserId);

    return {
      action,
      detail,
      note: syncedNote,
      disposition: REVIEW_HOLD_DISPOSITIONS.RELEASED_BY_ADJUSTMENT,
      pending_quantity: pendingAfter,
      closed_automatically: closedAutomatically,
      inventory_effect: 'VERIFIED_EXISTING_OPERATION',
      integrity,
      idempotent: false,
    };
  });
};

module.exports = { documentaryCloseDetail };

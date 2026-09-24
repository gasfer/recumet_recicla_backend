'use strict';

const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, TransferReviewNote, TransferReviewNoteDetail, TransferReviewResolutionAction,
  TransferReviewActionMovement, TransferReviewInventoryHold, User, Stock, Product, kardexMovements,
} = require('../database/config');
const {
  AUTOMATIC_RECONCILIATION_REASONS,
  RECONCILIATION_SPECIFIC_EFFECTS,
} = require('../constants/transfer-review');
const operationalDocuments = require('./reconciliation-operational-document.service');
const workflow = require('./transfer-review-workflow.service');
const notificationService = require('./notification.service');
const stockKardexIntegrity = require('./stock-kardex-integrity.service');
const { permissionDeniedError } = require('../helpers/permission-denied');
const {
  buildAutomaticVerification,
  inventoryProjection,
} = require('./transfer-reconciliation-registration-verification.service');
const { ACCOUNTING_STATUSES, TOLERANCE_DECISIONS } = require('../constants/transfer-reception-accounting');
const { applyExplicitEffect } = require('./inventory-posting.service');

const EPSILON = 0.0001;
const automaticError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

const reconciliationLocations = ({ command, operationType }) => {
  const locations = [{
    productId: command.productId,
    sucursalId: command.sourceSucursalId,
    storageId: command.sourceStorageId,
  }];
  if (operationType === 'CLASSIFIED' && command.targetProductId) {
    locations.push({
      productId: command.targetProductId,
      sucursalId: command.sourceSucursalId,
      storageId: command.sourceStorageId,
    });
  }
  return locations;
};

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
  const registrationActions = await TransferReviewResolutionAction.findAll({
    where: {
      id_transfer_review_note_detail: detail.id,
      management_status: 'ACTIVA',
      operation_status: { [Op.ne]: 'REVERSED' },
    }, transaction,
    include: [{ association: 'movementLinks', required: false, include: [{ association: 'kardexMovement', required: false }] }],
  });
  const registeredQuantity = registrationActions.reduce((total, action) => total + Number(action.quantity || 0), 0);
  const activeAutomatic = registrationActions.find((action) => action.operation_mode === 'CREATED_AUTOMATICALLY'
    && ['PENDING_RECEPTION', 'REVERSAL_PENDING'].includes(action.operation_status));
  const unresolvedRegisteredQuantity = Math.max(0, registeredQuantity - Number(detail.quantity_resolved || 0));
  return { note, detail, pending, activeAutomatic, registrationActions, registeredQuantity, unresolvedRegisteredQuantity };
};

const buildNormalReceipt = (context) => {
  const { detail } = context;
  const transferDetail = detail?.transferDetail;
  const sent = Number(detail?.quantity_sent ?? transferDetail?.quantity ?? 0);
  const received = Number(detail?.quantity_received ?? transferDetail?.quantity_received ?? 0);
  const normalQuantity = Math.min(sent, received);
  const diffPct = transferDetail?.receipt_difference_percentage !== null && transferDetail?.receipt_difference_percentage !== undefined
    ? Number(transferDetail.receipt_difference_percentage)
    : null;

  return {
    product_id: transferDetail?.id_product || detail?.id_product || null,
    product_cod: detail?.product?.cod || null,
    product_name: detail?.product?.name || null,
    quantity_sent: sent,
    quantity_received: received,
    normal_quantity: normalQuantity,
    tolerance_decision: transferDetail?.tolerance_decision || TOLERANCE_DECISIONS.REQUIRES_REVIEW,
    difference_percentage: diffPct,
    accounting_status: transferDetail?.accounting_status || ACCOUNTING_STATUSES.ACCOUNTED,
    accounting_applied_at: transferDetail?.accounting_applied_at || null,
  };
};

const buildBlockedDocument = (context) => {
  const { note, detail, pending } = context;
  const isShortage = note.type === 'FALTANTE_PARA_REVISION';
  const documentType = isShortage
    ? 'INGRESO_TEMPORAL_DIFERENCIAS'
    : 'NOTA_INGRESO_EXCEDENTE';

  const productId = isShortage
    ? (note.id_product || null)
    : (detail?.id_product || note.id_product || null);

  const product = isShortage
    ? note.registeredProduct
    : (detail?.product || note.registeredProduct);

  return {
    document_type: documentType,
    registry_number: note.registry_number || null,
    id_transfer_review_note: note.id,
    id_transfer: note.id_transfer || note.transfer?.id || null,
    transfer_cod: note.transfer?.cod || null,
    id_kardex_movement: note.id_kardex_movement || null,
    id_product: productId,
    product_cod: product?.cod || null,
    product_name: product?.name || null,
    quantity_blocked: Number(pending || 0),
    status: 'BLOQUEADO_EN_REVISION',
    disposition: 'EN_REVISION',
  };
};

const buildSolutions = ({ note, detail, pending }, reasonCode = null) => {
  const transfer = note.transfer;
  const receiver = { source_sucursal_id: transfer.id_sucursal_received, source_storage_id: note.id_storage };
  const origin = { target_sucursal_id: transfer.id_sucursal_send, target_storage_id: transfer.id_storage_send };
  const confirmation = {
    code: 'CONFIRM_DIFFERENCE', label: 'Confirmar diferencia sin movimiento adicional', operation_type: 'CONFIRMATION',
    specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.CONFIRM_DIFFERENCE,
    quantity: pending, product_id: note.type === 'FALTANTE_PARA_REVISION' ? note.id_product : detail.id_product,
    product: note.type === 'FALTANTE_PARA_REVISION' ? note.registeredProduct : detail.product, ...receiver,
    requires_authorizer: true, required_references: [], inventory_effect: 'NONE',
    warning: 'Se cerrará el pendiente sin crear documento ni movimiento de Kardex.',
  };
  const solutions = note.type === 'FALTANTE_PARA_REVISION' ? [
    confirmation,
    {
      code: 'LOCATE_SHORTAGE', label: 'Ingresar faltante localizado', operation_type: 'CLASSIFIED',
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.LOCATE_SHORTAGE,
      quantity: pending, product_id: note.id_product, target_product_id: detail.id_product,
      product: note.registeredProduct, target_product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'CLASSIFICATION',
      warning: 'Se descargará la cantidad localizada del producto MERMAS y se ingresará al producto original, actualizando Stock y Kardex sin duplicar la recepción.',
    },
    {
      code: 'REGISTER_RECEIPT_SHORTAGE', label: 'Registrar faltante en Merma por diferencia de balanza traslado', operation_type: 'WASTE_ENTRY',
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.REGISTER_RECEIPT_SHORTAGE,
      quantity: pending, product_id: note.id_product, target_product_id: detail.id_product,
      product: note.registeredProduct, target_product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'WASTE_INPUT',
      warning: 'Se registrará el faltante en el producto MERMAS vinculado, con Stock, Kardex y referencia automática a la boleta de recepción.',
    },
    {
      code: 'CLASSIFY_SHORTAGE', label: 'Clasificar diferencia al producto faltante', operation_type: 'CLASSIFIED',
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.CLASSIFY_SHORTAGE,
      quantity: pending, product_id: note.id_product, target_product_id: detail.id_product,
      product: note.registeredProduct, target_product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'CLASSIFICATION',
      warning: 'Se crearán la clasificación, los movimientos de stock, Kardex y la trazabilidad.',
    },
  ] : [
    confirmation,
    {
      code: 'REGISTER_RECEIPT_SURPLUS', label: 'Registrar excedente en el mismo producto', operation_type: 'KARDEX_ENTRY',
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.REGISTER_RECEIPT_SURPLUS,
      quantity: pending, product_id: detail.id_product, product: detail.product, ...receiver,
      requires_authorizer: true, required_references: [], inventory_effect: 'KARDEX_INPUT',
      warning: 'Se completará únicamente el ingreso faltante en Kardex del mismo producto; el Stock recibido no se duplicará.',
    },
    {
      code: 'TRANSFER_RETURN', label: 'Devolver excedente al origen', operation_type: 'TRANSFER',
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.TRANSFER_RETURN,
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
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS.CLASSIFY_EXCESS,
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
  if (!allowed) throw permissionDeniedError('aprobar conciliaciones de esta sucursal con el autorizador seleccionado');
  return authorizer;
};

const receiptReference = (note) => ({
  document_type: 'BOLETA_RECEPCION',
  document_number: String(note.transfer?.cod || note.transfer?.registry_number || note.registry_number),
  document_date: new Date(note.transfer?.date_received || note.transfer?.date_send || note.date).toISOString().slice(0, 10),
});

const loadVerificationInventory = async (context) => {
  const productId = context.note.type === 'FALTANTE_PARA_REVISION'
    ? context.note.id_product
    : context.detail.id_product;
  const [stock, kardexRows] = await Promise.all([
    Stock.findOne({
      where: {
        id_product: productId,
        id_sucursal: context.note.id_sucursal,
        id_storage: context.note.id_storage,
        status: true,
      },
    }),
    sequelize.query(`
      SELECT saldo
      FROM view_kardex_detalle
      WHERE id_product = :productId AND id_sucursal = :sucursalId AND id_storage = :storageId
      ORDER BY date DESC, id DESC
      LIMIT 1
    `, {
      replacements: { productId, sucursalId: context.note.id_sucursal, storageId: context.note.id_storage },
      type: QueryTypes.SELECT,
    }),
  ]);
  const beforeStock = Number(stock?.stock || 0);
  const beforeKardex = Number(kardexRows[0]?.saldo || 0);
  if (context.registrationActions.length > 0) {
    return {
      before_stock: beforeStock,
      before_kardex: beforeKardex,
      after_stock: beforeStock,
      after_kardex: beforeKardex,
    };
  }
  return inventoryProjection({
    stock: beforeStock,
    kardex: beforeKardex,
    quantity: context.pending,
    differenceType: context.note.type,
  });
};

const createKardexEntry = async ({ productId, quantity, note, actorUserId, transaction }) => {
  const transfer = note.transfer;
  const movement = await kardexMovements.create({
    type: 'INPUT', date: new Date(), quantity, cost: 0, price: 0, total: 0, status: true,
    details: `EXCEDENTE POR ERROR DE REGISTRO EN RECEPCIÓN · BOLETA ${receiptReference(note).document_number}`,
    registry_number: transfer?.registry_number || note.registry_number,
    id_product: productId, id_user: actorUserId, id_sucursal: note.id_sucursal, id_storage: note.id_storage,
  }, { transaction });
  return { type: 'KARDEX_ENTRY', document: { id: null, cod: receiptReference(note).document_number }, movements: [movement] };
};

const createWasteEntry = async ({ productId, quantity, note, actorUserId, transaction }) => {
  const product = await Product.findOne({
    where: { id: productId, status: true },
    include: [{ association: 'category', required: true, where: { name: 'MERMAS', type: 'RAW_MATERIAL', status: true } }],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!product) throw automaticError('El faltante debe registrarse en un producto activo de la categoría MERMAS.', 409);
  const { movement } = await applyExplicitEffect({
    direction: 'INPUT', productId, sucursalId: note.id_sucursal, storageId: note.id_storage,
    quantity, actorUserId, date: new Date(), cost: 0,
    details: `FALTANTE POR ERROR DE REGISTRO EN RECEPCIÓN · BOLETA ${receiptReference(note).document_number}`,
    registryNumber: note.transfer?.registry_number || note.registry_number,
    sourceType: 'TRANSFER_REVIEW_AUTOMATIC', sourceId: note.id,
    sourceDetailId: `WASTE:${productId}`, effectType: 'WASTE_ENTRY',
    idempotencyKey: `TRANSFER_REVIEW_AUTOMATIC:${note.id}:WASTE:${productId}`,
    transaction,
  });
  return { type: 'WASTE_ENTRY', document: { id: null, cod: receiptReference(note).document_number }, movements: [movement] };
};

const preview = async ({ noteId, detailId }) => {
  const context = await loadContext({ noteId, detailId });
  const inventory = await loadVerificationInventory(context);
  const verification = buildAutomaticVerification({
    context,
    actions: context.registrationActions,
    inventory,
  });
  const normalReceipt = buildNormalReceipt(context);
  const blockedDocument = buildBlockedDocument(context);

  if (verification.is_blocked) {
    return {
      status: 'REGISTRATION_EXISTS',
      message: verification.message,
      pending_quantity: context.pending,
      normal_receipt: normalReceipt,
      blocked_document: blockedDocument,
      verification,
      reasons: [],
      solutions: [],
    };
  }
  if (context.pending <= EPSILON) {
    return {
      status: 'ALREADY_RECONCILED',
      message: 'Ya se registró esta conciliación.',
      pending_quantity: 0,
      normal_receipt: normalReceipt,
      blocked_document: blockedDocument,
      verification,
      reasons: [],
      solutions: [],
    };
  }
  return {
    status: 'READY',
    detail_version: Number(context.detail.updatedAt?.getTime?.() || 1),
    pending_quantity: context.pending,
    normal_receipt: normalReceipt,
    blocked_document: blockedDocument,
    reasons: buildReasons(context.note.type),
    solutions: buildSolutions(context),
    verification,
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

const confirmInTransaction = async ({
  noteId, detailId, solutionCode, targetProductId, reasonCode, justification,
  documentReferences, authorizerUserId, detailVersion, quantity, idempotencyKey, actorUserId, transaction,
}) => {
  const existing = await TransferReviewResolutionAction.findOne({ where: { idempotency_key: idempotencyKey }, transaction });
  if (existing) {
    return {
      action: existing,
      idempotent: true,
      specific_effect: RECONCILIATION_SPECIFIC_EFFECTS[existing.strategy] || null,
      applied_effect: RECONCILIATION_SPECIFIC_EFFECTS[existing.strategy] || null,
    };
  }
  const context = await loadContext({ noteId, detailId, transaction, lock: true });
  const verification = buildAutomaticVerification({ context, actions: context.registrationActions, inventory: null });
  if (verification.is_blocked) throw automaticError(verification.message, 409);
  if (context.pending <= EPSILON) throw automaticError('Ya se registró esta conciliación.', 409);
  const currentVersion = Number(context.detail.updatedAt?.getTime?.() || 1);
  if (detailVersion !== undefined && detailVersion !== null && (!Number.isFinite(detailVersion) || detailVersion !== currentVersion)) {
    throw automaticError('La conciliación cambió después de la previsualización. Actualice los datos antes de confirmar.', 409);
  }
  if (String(justification || '').trim().length < 10) throw automaticError('Escriba una justificación operativa de al menos 10 caracteres.');
  const { references: suppliedReferences } = validateReasonAndReferences({ noteType: context.note.type, reasonCode, documentReferences });
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
      : solution.operation_type === 'KARDEX_ENTRY'
        ? await createKardexEntry({ productId: command.productId, quantity: requested, note: context.note, actorUserId, transaction })
        : solution.operation_type === 'WASTE_ENTRY'
          ? await createWasteEntry({ productId: command.productId, quantity: requested, note: context.note, actorUserId, transaction })
      : { type: 'CONFIRMATION', document: { id: null, cod: context.note.registry_number }, movements: [] };
  const references = ['KARDEX_ENTRY', 'WASTE_ENTRY'].includes(solution.operation_type)
    ? [...suppliedReferences, receiptReference(context.note)]
    : suppliedReferences;
  const action = await TransferReviewResolutionAction.create({
    idempotency_key: idempotencyKey, strategy: solutionCode, quantity: requested,
    observations: command.observations, id_transfer_review_note: context.note.id,
    id_transfer_review_note_detail: context.detail.id, id_user: actorUserId,
    id_approved_user: authorizer.id, approved_at: new Date(),
    operation_mode: 'CREATED_AUTOMATICALLY', operation_type: operation.type,
    operation_id: operation.document.id,
    operation_status: operation.pendingReception === true ? 'PENDING_RECEPTION' : 'ACTIVE',
    detail_version: Number(context.detail.updatedAt?.getTime?.() || 1),
  }, { transaction });
  context.detail.cause = reasonCode;
  for (const movement of operation.movements) await TransferReviewActionMovement.create({
    id_transfer_review_resolution_action: action.id, id_kardex_movement: movement.id, movement_role: 'ORIGINAL',
  }, { transaction });
  const pendingReception = operation.pendingReception === true;
  const integrity = await stockKardexIntegrity.verifyLocationsIntegrity({
    locations: reconciliationLocations({ command, operationType: solution.operation_type }),
    transaction,
  });
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
    specific_effect: solution.specific_effect, applied_effect: solution.specific_effect,
    integrity,
  }, transaction);
  await notificationService.notifyTransferReviewStakeholders({
    note: syncedNote, title: `Conciliación automática ${context.note.registry_number}`,
    message: operation.type === 'CONFIRMATION'
      ? 'La diferencia fue confirmada sin crear otro movimiento de inventario.'
      : `Se creó ${operation.type} #${operation.document.cod} sin registros manuales.`,
    type: 'TRANSFER_REVIEW_AUTOMATED', level: pendingAfter <= EPSILON ? 'INFO' : 'WARNING', eventKey: `automatic-resolution:${event.id}`,
  }, transaction, actorUserId);
  const normalReceipt = buildNormalReceipt(context);
  const blockedDocument = buildBlockedDocument(context);
  const specificEffect = solution.specific_effect || RECONCILIATION_SPECIFIC_EFFECTS[solutionCode] || null;
  return {
    action,
    operation: { type: operation.type, id: operation.document.id, code: operation.document.cod },
    pending_quantity: pendingAfter,
    pending_reception: pendingReception,
    idempotent: false,
    normal_receipt: normalReceipt,
    blocked_document: blockedDocument,
    specific_effect: specificEffect,
    applied_effect: specificEffect,
    integrity,
  };
};

const normalizeConfirmationError = async (error, idempotencyKey) => {
  if (error?.name === 'SequelizeUniqueConstraintError') {
    if (idempotencyKey) {
      const existing = await TransferReviewResolutionAction.findOne({ where: { idempotency_key: idempotencyKey } });
      if (existing) {
        return {
          action: existing,
          idempotent: true,
          specific_effect: RECONCILIATION_SPECIFIC_EFFECTS[existing.strategy] || null,
          applied_effect: RECONCILIATION_SPECIFIC_EFFECTS[existing.strategy] || null,
        };
      }
    }
    throw automaticError('Ya se registró esta conciliación. No se creó un registro duplicado.', 409);
  }
  throw error;
};

const confirm = async (payload) => sequelize.transaction(async (transaction) => (
  confirmInTransaction({ ...payload, transaction })
)).catch((err) => normalizeConfirmationError(err, payload?.idempotencyKey));

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

module.exports = {
  preview,
  confirm,
  confirmInTransaction,
  completePendingTransfer,
  SPECIFIC_EFFECTS: RECONCILIATION_SPECIFIC_EFFECTS,
  RECONCILIATION_SPECIFIC_EFFECTS,
};

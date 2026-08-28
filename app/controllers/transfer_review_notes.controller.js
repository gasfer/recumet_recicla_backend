const { request, response } = require('express');
const { randomUUID } = require('crypto');
const PdfPrinter = require('pdfmake');
const fonts = require('../helpers/generator-pdf/fonts');
const styles = require('../helpers/generator-pdf/styles');
const { TransferReviewNote } = require('../database/config');
const workflowService = require('../services/transfer-review-workflow.service');
const resolutionService = require('../services/transfer-review-resolution.service');
const documentaryService = require('../services/transfer-review-documentary.service');
const { REVIEW_PERMISSION_ACTIONS, REVIEW_PERMISSION_MODULE } = require('../constants/transfer-review');
const { getStockDiagnostic, getRetainedWithoutAdjustmentReport } = require('../services/stock-availability.service');
const reconciliationManagementService = require('../services/transfer-reconciliation-management.service');
const automatedResolutionService = require('../services/automated-transfer-review-resolution.service');

const noteInclude = [
  { association: 'transfer', include: [{ association: 'sucursal_send', attributes: ['name'] }, { association: 'sucursal_received', attributes: ['name'] }] },
  { association: 'registeredProduct', attributes: ['cod', 'name'] },
  { association: 'user', attributes: ['full_names'] },
  { association: 'assignedUser', attributes: ['id', 'full_names'] },
  { association: 'resolvedUser', attributes: ['id', 'full_names'] },
  { association: 'sucursal', attributes: ['name'] },
  { association: 'storage', attributes: ['name'] },
  { association: 'details', include: [
    { association: 'product', attributes: ['cod', 'name'] },
    { association: 'inventoryHolds' },
    { association: 'resolutionActions', include: [
      { association: 'user', attributes: ['id', 'full_names'] },
      { association: 'approvedUser', attributes: ['id', 'full_names'] },
      { association: 'movementLinks', include: [{ association: 'kardexMovement' }] },
    ] },
  ] },
  { association: 'events', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
  { association: 'evidences', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
];

const allowedSucursalIds = (user) => (
  user.role === 'ADMINISTRADOR'
    ? null
    : (user.assign_sucursales || []).map(({ id_sucursal }) => Number(id_sucursal))
);

const canAccessSucursal = (user, sucursalId) => {
  const allowed = allowedSucursalIds(user);
  return allowed === null || allowed.includes(Number(sucursalId));
};

const hasReviewPermission = (user, action) => {
  if (user.role === 'ADMINISTRADOR') return true;
  const permission = (user.assign_permission || []).find(({ module, status }) => module === REVIEW_PERMISSION_MODULE && status !== false);
  return permission?.[REVIEW_PERMISSION_ACTIONS[action]] === true;
};

const sendWorkflowError = (res, error) => {
  console.log(error);
  const trackingId = error.statusCode ? null : randomUUID();
  return res.status(error.statusCode || 500).json({
    ok: false,
    tracking_id: trackingId,
    errors: [{ msg: error.statusCode ? error.message : `Ocurrió un imprevisto interno. Informe a soporte el código ${trackingId}.` }],
  });
};

const findAuthorizedNote = async (req) => {
  const note = await TransferReviewNote.findByPk(req.params.id, { include: noteInclude });
  if (!note) throw Object.assign(new Error('Nota de revisión no encontrada.'), { statusCode: 404 });
  if (!canAccessSucursal(req.userAuth, note.id_sucursal)) {
    throw Object.assign(new Error('No tienes acceso a revisiones de esta sucursal.'), { statusCode: 403 });
  }
  return note;
};

const getReviewNote = async (req = request, res = response) => {
  try {
    const note = await findAuthorizedNote(req);
    return res.status(200).json({ ok: true, note });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getManagedReconciliations = async (req = request, res = response) => {
  try {
    const requestedSucursal = req.query.id_sucursal ? Number(req.query.id_sucursal) : null;
    if (requestedSucursal && !canAccessSucursal(req.userAuth, requestedSucursal)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    }
    const allowed = allowedSucursalIds(req.userAuth);
    const idSucursal = requestedSucursal || (allowed?.length === 1 ? allowed[0] : null);
    if (allowed && !idSucursal) return res.status(422).json({ ok: false, errors: [{ msg: 'Debe seleccionar una sucursal autorizada.' }] });
    const reconciliations = await reconciliationManagementService.list({
      page: req.query.page, limit: req.query.limit, query: req.query.query, status: req.query.status,
      idSucursal, dateFrom: req.query.date_from, dateTo: req.query.date_to,
    });
    return res.status(200).json({ ok: true, reconciliations });
  } catch (error) { return sendWorkflowError(res, error); }
};

const reverseReconciliation = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const note = await reconciliationManagementService.reverse({ noteId: Number(req.params.id), reason: req.body.reason, actorUserId: req.userAuth.id });
    return res.status(200).json({ ok: true, msg: 'Conciliación revertida. La diferencia volvió a revisión.', note });
  } catch (error) { return sendWorkflowError(res, error); }
};

const deleteReconciliation = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const note = await reconciliationManagementService.remove({ noteId: Number(req.params.id), reason: req.body.reason, actorUserId: req.userAuth.id });
    return res.status(200).json({ ok: true, msg: 'Conciliación eliminada de la operación y conservada en auditoría.', note });
  } catch (error) { return sendWorkflowError(res, error); }
};

const getOpenReviews = async (req = request, res = response) => {
  try {
    const idSucursal = Number(req.query.id_sucursal);
    const idStorage = req.query.id_storage ? Number(req.query.id_storage) : null;
    if (!idSucursal) return res.status(422).json({ ok: false, errors: [{ msg: 'Debe indicar una sucursal.' }] });
    if (!canAccessSucursal(req.userAuth, idSucursal)) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    const reviews = await workflowService.listOpenReviews({ idSucursal, idStorage, limit: req.query.limit });
    return res.status(200).json({ ok: true, reviews, total: reviews.length });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getAssignableUsers = async (req = request, res = response) => {
  try {
    const idSucursal = Number(req.query.id_sucursal);
    if (!idSucursal) return res.status(422).json({ ok: false, errors: [{ msg: 'Debe indicar una sucursal.' }] });
    if (!canAccessSucursal(req.userAuth, idSucursal)) return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    const users = await workflowService.listAssignableUsers(idSucursal);
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getTraceability = async (req = request, res = response) => {
  try {
    const traceability = await workflowService.getTransferTraceability(req.params.id_transfer);
    if (!canAccessSucursal(req.userAuth, traceability.id_sucursal_received)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta recepción.' }] });
    }
    return res.status(200).json({ ok: true, traceability });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getReviewReport = async (req = request, res = response) => {
  try {
    const requestedSucursal = req.query.id_sucursal ? Number(req.query.id_sucursal) : null;
    const allowed = allowedSucursalIds(req.userAuth);
    if (requestedSucursal && !canAccessSucursal(req.userAuth, requestedSucursal)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    }
    const idSucursal = requestedSucursal || (allowed?.length === 1 ? allowed[0] : null);
    if (allowed && !idSucursal) return res.status(422).json({ ok: false, errors: [{ msg: 'Debe seleccionar una sucursal autorizada.' }] });
    const report = await workflowService.getReviewReport({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      idSucursal,
      productId: req.query.id_product ? Number(req.query.id_product) : null,
      assignedUserId: req.query.id_assigned_user ? Number(req.query.id_assigned_user) : null,
      ageFromDays: req.query.age_from_days,
      ageToDays: req.query.age_to_days,
    });
    return res.status(200).json({ ok: true, report });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getReviewStockDiagnostic = async (req = request, res = response) => {
  try {
    const idSucursal = req.query.id_sucursal ? Number(req.query.id_sucursal) : null;
    const idStorage = req.query.id_storage ? Number(req.query.id_storage) : null;
    if (idSucursal && !canAccessSucursal(req.userAuth, idSucursal)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    }
    const rows = await getStockDiagnostic({ idSucursal, idStorage, limit: req.query.limit });
    return res.status(200).json({ ok: true, diagnostic: rows });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const getRetainedWithoutAdjustment = async (req = request, res = response) => {
  try {
    const idSucursal = req.query.id_sucursal ? Number(req.query.id_sucursal) : null;
    const idStorage = req.query.id_storage ? Number(req.query.id_storage) : null;
    if (idSucursal && !canAccessSucursal(req.userAuth, idSucursal)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tienes acceso a esta sucursal.' }] });
    }
    const retained = await getRetainedWithoutAdjustmentReport({ idSucursal, idStorage, limit: req.query.limit });
    return res.status(200).json({ ok: true, retained, total: retained.length });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const assignReview = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const note = await workflowService.assignReview({
      noteId: req.params.id,
      assignedUserId: Number(req.body.id_assigned_user),
      observation: String(req.body.assignment_observation || '').trim(),
      actorUserId: req.userAuth.id,
    });
    return res.status(200).json({ ok: true, msg: 'Revisión asignada correctamente.', note });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const addComment = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const description = String(req.body.description || '').trim();
    if (!description) return res.status(422).json({ ok: false, errors: [{ msg: 'El comentario es obligatorio.' }] });
    const event = await workflowService.addComment({ noteId: req.params.id, description, actorUserId: req.userAuth.id });
    return res.status(201).json({ ok: true, msg: 'Comentario registrado.', event });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const addManualAction = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const actionType = String(req.body.action_type || '').trim();
    const description = String(req.body.description || '').trim();
    const referenceCode = String(req.body.reference_code || '').trim();
    const allowedTypes = ['DEVOLUCION_ORIGEN', 'REPOSICION_CLASIFICADO', 'NUEVO_PESAJE', 'AJUSTE_MANUAL', 'OTRA'];
    if (!allowedTypes.includes(actionType) || !description) {
      return res.status(422).json({ ok: false, errors: [{ msg: 'Debe seleccionar una acción e indicar qué se realizó.' }] });
    }
    if (['DEVOLUCION_ORIGEN', 'REPOSICION_CLASIFICADO', 'AJUSTE_MANUAL'].includes(actionType) && !referenceCode) {
      return res.status(422).json({ ok: false, errors: [{ msg: 'Esta acción requiere el código de boleta, clasificado o ajuste relacionado.' }] });
    }
    const event = await workflowService.addManualAction({
      noteId: Number(req.params.id),
      detailId: req.body.detail_id ? Number(req.body.detail_id) : null,
      actionType,
      description,
      referenceType: String(req.body.reference_type || '').trim() || null,
      referenceCode: referenceCode || null,
      productId: req.body.id_product ? Number(req.body.id_product) : null,
      actorUserId: req.userAuth.id,
    });
    return res.status(201).json({ ok: true, msg: 'Acción incorporada a la trazabilidad.', event });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const addEvidence = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const { evidence_type, file_name, file_url, description, checksum } = req.body;
    if (!evidence_type || (!file_url && !description)) {
      return res.status(422).json({ ok: false, errors: [{ msg: 'La evidencia requiere tipo y archivo o descripción.' }] });
    }
    const evidence = await workflowService.addEvidence({ noteId: req.params.id, evidence: { evidence_type, file_name, file_url, description, checksum }, actorUserId: req.userAuth.id });
    return res.status(201).json({ ok: true, msg: 'Evidencia registrada.', evidence });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const closeReview = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const note = await workflowService.closeReview({ noteId: req.params.id, actorUserId: req.userAuth.id });
    return res.status(200).json({ ok: true, msg: 'Revisión cerrada.', note });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const reopenReview = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(422).json({ ok: false, errors: [{ msg: 'Debe indicar el motivo de reapertura.' }] });
    const note = await workflowService.reopenReview({ noteId: req.params.id, detailIds: req.body.detail_ids, reason, actorUserId: req.userAuth.id });
    return res.status(200).json({ ok: true, msg: 'Revisión reabierta.', note });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const resolveReviewDetail = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const result = await resolutionService.resolveReviewDetail({
      noteId: Number(req.params.id),
      detailId: Number(req.params.detail_id),
      strategy: req.body.strategy,
      quantity: req.body.quantity,
      cause: req.body.cause,
      observations: req.body.observations,
      targetProductId: req.body.id_target_product,
      idempotencyKey: req.header('Idempotency-Key') || req.body.idempotency_key || randomUUID(),
      actorUserId: req.userAuth.id,
      actorCanApprove: hasReviewPermission(req.userAuth, 'approve'),
    });
    return res.status(result.idempotent ? 200 : 201).json({
      ok: true,
      msg: result.idempotent ? 'La resolución ya había sido aplicada.' : 'Resolución aplicada correctamente.',
      ...result,
    });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const documentaryCloseReviewDetail = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const result = await documentaryService.documentaryCloseDetail({
      noteId: Number(req.params.id),
      detailId: Number(req.params.detail_id),
      reasonCode: String(req.body.reason_code || '').trim(),
      noteOrReference: String(req.body.note_or_reference || '').trim(),
      documentReferences: req.body.document_references,
      operationalJustification: String(req.body.operational_justification || '').trim(),
      authorizerUserId: req.body.id_authorizer_user ? Number(req.body.id_authorizer_user) : null,
      quantity: req.body.quantity,
      evidence: req.body.evidence,
      idempotencyKey: req.header('Idempotency-Key') || req.body.idempotency_key || randomUUID(),
      actorUserId: req.userAuth.id,
    });
    return res.status(result.idempotent ? 200 : 201).json({
      ok: true,
      msg: result.idempotent
        ? 'La regularización ya había sido verificada.'
        : 'Diferencia conciliada con una regularización verificada.',
      ...result,
    });
  } catch (error) {
    return sendWorkflowError(res, error);
  }
};

const previewAutomaticResolution = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const preview = await automatedResolutionService.preview({ noteId: Number(req.params.id), detailId: Number(req.params.detail_id) });
    return res.status(200).json({ ok: true, preview });
  } catch (error) { return sendWorkflowError(res, error); }
};

const confirmAutomaticResolution = async (req = request, res = response) => {
  try {
    await findAuthorizedNote(req);
    const result = await automatedResolutionService.confirm({
      noteId: Number(req.params.id), detailId: Number(req.params.detail_id),
      solutionCode: String(req.body.solution_code || '').trim(), targetProductId: req.body.id_target_product,
      reasonCode: String(req.body.reason_code || '').trim(),
      justification: String(req.body.operational_justification || '').trim(),
      documentReferences: req.body.document_references,
      authorizerUserId: Number(req.body.id_authorizer_user),
      detailVersion: Number(req.body.detail_version),
      quantity: req.body.quantity,
      idempotencyKey: req.header('Idempotency-Key') || req.body.idempotency_key || randomUUID(), actorUserId: req.userAuth.id,
    });
    return res.status(result.idempotent ? 200 : 201).json({ ok: true, msg: result.idempotent ? 'La conciliación ya había sido aplicada.' : 'Conciliación automática creada con todos sus registros.', ...result });
  } catch (error) { return sendWorkflowError(res, error); }
};

const printReviewNote = async (req = request, res = response) => {
  try {
    const note = await findAuthorizedNote(req);
    const isShortage = note.type === 'FALTANTE_PARA_REVISION';
    const title = isShortage ? 'NOTA FALTANTE A REVISAR' : 'NOTA EXCEDENTE A REVISAR';
    const differenceLabel = isShortage ? 'FALTANTE' : 'PESO EXCEDIDO';
    const totalDifference = note.details.reduce(
      (total, detail) => total + Number(detail.quantity_difference || 0),
      0
    );
    const resolutionRows = note.details.flatMap((detail) => (detail.resolutionActions || []).map((action) => {
      const retainedHold = (detail.inventoryHolds || []).find(({ disposition }) => disposition === 'RETENIDO_SIN_AJUSTE');
      const movements = (action.movementLinks || []).map((link) => `#${link.id_kardex_movement}`).join(', ');
      return [
        `${detail.product.cod} - ${detail.product.name}`,
        action.strategy,
        detail.cause || '-',
        action.observations || '-',
        action.quantity,
        retainedHold ? `RETENIDO SIN AJUSTE (${retainedHold.quantity})` : '-',
        movements || 'Sin movimientos',
      ];
    }));
    const body = [[
      { text: 'PRODUCTO', bold: true }, { text: 'ENVIADO', bold: true }, { text: 'RECIBIDO', bold: true }, { text: differenceLabel, bold: true }
    ], ...note.details.map((detail) => [
      `${detail.product.cod} - ${detail.product.name}`, detail.quantity_sent, detail.quantity_received, detail.quantity_difference
    ])];
    const definition = {
      content: [
        { text: `NOTA DE TRASLADO: #${note.transfer.cod} – ${title}`, style: 'title', bold: true },
        { text: `Correlativo: ${note.registry_number}`, margin: [0, 8, 0, 0] },
        { text: `Estado de conciliación: ${note.reconciliation_status}` },
        { text: `Efecto de inventario: ${resolutionRows.some((row) => row[6] === 'Sin movimientos') ? 'SIN AJUSTE DE INVENTARIO' : 'CON MOVIMIENTOS AUTORIZADOS'}` },
        { text: `Responsable: ${note.assignedUser?.full_names || 'Sin asignar'}` },
        { text: `Fecha: ${new Date(note.date).toLocaleString('es-BO')}` },
        { text: `Origen: ${note.transfer.sucursal_send.name}  |  Destino: ${note.transfer.sucursal_received.name}` },
        { text: `Almacén: ${note.storage.name}  |  Usuario: ${note.user.full_names}` },
        { text: `Producto registrado: ${note.registeredProduct.cod} - ${note.registeredProduct.name}`, margin: [0, 0, 0, 10] },
        { table: { widths: ['*', 70, 70, 70], body } },
        ...(isShortage ? [{ text: `TOTAL FALTANTE: ${totalDifference}`, margin: [0, 8, 0, 0], bold: true }] : []),
        { text: `Observaciones: ${note.observations || '-'}`, margin: [0, 12, 0, 0] },
        ...(resolutionRows.length > 0 ? [
          { text: 'ACCIONES DE CONCILIACIÓN', margin: [0, 12, 0, 5], bold: true },
          { table: { widths: ['*', 80, 60, 80, 45, 80, 65], body: [[
            { text: 'PRODUCTO', bold: true }, { text: 'RESULTADO', bold: true }, { text: 'MOTIVO', bold: true }, { text: 'REFERENCIA', bold: true }, { text: 'CANT.', bold: true }, { text: 'DISPOSICIÓN', bold: true }, { text: 'KARDEX', bold: true },
          ], ...resolutionRows] } },
        ] : []),
        ...(note.evidences.length > 0 ? [{
          text: `Evidencias: ${note.evidences.map((evidence) => `${evidence.evidence_type}${evidence.description ? ` (${evidence.description})` : ''}`).join(' · ')}`,
          margin: [0, 10, 0, 0],
        }] : []),
      ], styles,
    };
    const pdfDoc = new PdfPrinter(fonts).createPdfKitDocument(definition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=${note.registry_number}.pdf`);
      res.send(Buffer.concat(chunks));
    });
    pdfDoc.end();
  } catch (error) {
    console.log(error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo generar la nota de revisión.' }] });
  }
};

module.exports = {
  getManagedReconciliations,
  reverseReconciliation,
  deleteReconciliation,
  getReviewNote,
  getOpenReviews,
  getAssignableUsers,
  getTraceability,
  getReviewReport,
  getReviewStockDiagnostic,
  getRetainedWithoutAdjustment,
  assignReview,
  addComment,
  addManualAction,
  addEvidence,
  closeReview,
  reopenReview,
  resolveReviewDetail,
  documentaryCloseReviewDetail,
  previewAutomaticResolution,
  confirmAutomaticResolution,
  printReviewNote,
};

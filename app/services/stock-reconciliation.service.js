'use strict';

const crypto = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  sequelize,
  Stock,
  StockReconciliationCase,
  StockReconciliationEvent,
  StockReconciliationEvidence,
  StockReconciliationDecision,
  StockReconciliationAuthorization,
  StockReconciliationAction,
  kardexMovements,
  History,
  User,
} = require('../database/config');
const { registerKardexOnlyEffect, applyStockDelta } = require('./inventory-posting.service');
const { getStockKardexIrregularities } = require('./stock-availability.service');
const {
  STOCK_RECONCILIATION_STATUSES: STATUSES,
  STOCK_RECONCILIATION_STRATEGIES: STRATEGIES,
} = require('../constants/stock-reconciliation');
const { getEpsilon, investigationErrors, buildPreview, assertStatusTransition } = require('./stock-reconciliation-policy.service');
const { decimalSubtract, decimalToNumber } = require('../helpers/number-formatter');

const serviceError = (message, statusCode = 422, details) => Object.assign(new Error(message), { statusCode, details });
const normalizeNumber = (value) => decimalToNumber(value || 0);
const directionFor = (difference) => Number(difference) > 0 ? 'STOCK_MAYOR_QUE_KARDEX' : 'KARDEX_MAYOR_QUE_STOCK';
const normalizeFingerprintTimestamp = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};
const fingerprintFor = ({ id_product, id_sucursal, id_storage, physical_stock, kardex_balance, stock_updated_at, kardex_last_id }) => crypto
  .createHash('sha256')
  .update([
    Number(id_product), Number(id_sucursal), Number(id_storage),
    normalizeNumber(physical_stock), normalizeNumber(kardex_balance),
    normalizeFingerprintTimestamp(stock_updated_at), kardex_last_id ? String(kardex_last_id) : '',
  ].join('|'))
  .digest('hex');

const caseInclude = [
  { association: 'product', attributes: ['id', 'cod', 'name'] },
  { association: 'sucursal', attributes: ['id', 'name'] },
  { association: 'storage', attributes: ['id', 'name'] },
  { association: 'assignedUser', attributes: ['id', 'full_names'] },
  { association: 'authorizedUser', attributes: ['id', 'full_names'] },
  { association: 'resolvedUser', attributes: ['id', 'full_names'] },
  { association: 'evidences', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
  { association: 'decisions', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
  { association: 'authorizations', include: [
    { association: 'requestedUser', attributes: ['id', 'full_names'] },
    { association: 'authorizedUser', attributes: ['id', 'full_names'] },
  ] },
  { association: 'events', include: [{ association: 'user', attributes: ['id', 'full_names'] }] },
  { association: 'actions', include: [{ association: 'kardexMovement' }, { association: 'countResponsible', attributes: ['id', 'full_names'] }] },
];

const getCurrentSnapshot = async ({ productId, sucursalId, storageId, transaction, lock = false }) => {
  const stock = await Stock.findOne({
    where: { id_product: productId, id_sucursal: sucursalId, id_storage: storageId, status: true },
    transaction,
    ...(lock ? { lock: { level: transaction.LOCK.UPDATE, of: Stock } } : {}),
  });
  if (!stock) throw serviceError('No existe una fila activa de Stock para este producto y ubicación.', 404);
  const [currentKardex] = await sequelize.query(`
    SELECT
      COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS saldo,
      MAX(id) AS id
    FROM view_kardex_detalle
    WHERE id_product = :productId AND id_sucursal = :sucursalId AND id_storage = :storageId
      AND date <= CURRENT_TIMESTAMP
  `, { replacements: { productId, sucursalId, storageId }, type: QueryTypes.SELECT, transaction });
  const snapshot = {
    id_product: Number(productId), id_sucursal: Number(sucursalId), id_storage: Number(storageId),
    physical_stock: normalizeNumber(stock.stock), kardex_balance: normalizeNumber(currentKardex?.saldo),
    stock_updated_at: stock.updatedAt?.toISOString?.() || String(stock.updatedAt || ''), kardex_last_id: currentKardex?.id || null,
  };
  snapshot.physical_kardex_difference = decimalSubtract(snapshot.physical_stock, snapshot.kardex_balance);
  snapshot.fingerprint = fingerprintFor(snapshot);
  return { stock, snapshot };
};

const createEvent = ({ caseId, userId, type, description, metadata = {}, transaction }) => StockReconciliationEvent.create({
  id_stock_reconciliation_case: caseId, id_user: userId, event_type: type, description, metadata,
}, { transaction });

const validateAuthorizer = async ({ authorizerUserId, sucursalId, transaction }) => {
  const authorizer = await User.findOne({
    where: { id: Number(authorizerUserId), status: true },
    include: [
      { association: 'assign_permission', required: false, where: { module: 'STOCK_RECONCILIATION', status: { [Op.ne]: false } } },
      { association: 'assign_sucursales', required: false, where: { id_sucursal: sucursalId, status: { [Op.ne]: false } } },
    ],
    transaction,
  });
  const allowed = authorizer && (authorizer.role === 'ADMINISTRADOR' || (
    authorizer.assign_sucursales?.length > 0
    && authorizer.assign_permission?.some(({ reports }) => reports === true)
  ));
  if (!allowed) throw serviceError('El usuario seleccionado no puede autorizar conciliaciones Stock–Kardex en esta sucursal.', 403);
  return authorizer;
};

const eligibleUserWhere = { status: true, role: { [Op.in]: ['ADMINISTRADOR', 'ENCARGADO'] } };

const validateCountResponsible = async ({ userId, sucursalId, transaction }) => {
  const user = await User.findOne({
    where: { ...eligibleUserWhere, id: Number(userId) },
    include: [{ association: 'assign_sucursales', required: false, where: { id_sucursal: Number(sucursalId), status: { [Op.ne]: false } } }],
    transaction,
  });
  const allowed = user && ['ADMINISTRADOR', 'ENCARGADO'].includes(user.role)
    && (user.role === 'ADMINISTRADOR' || user.assign_sucursales?.length > 0);
  if (!allowed) throw serviceError('El responsable del conteo debe ser un administrador o encargado activo autorizado para esta sucursal.', 403);
  return user;
};

const listCountResponsibles = async ({ sucursalId }) => {
  const users = await User.findAll({
    where: eligibleUserWhere, attributes: ['id', 'full_names', 'role'],
    include: [{ association: 'assign_sucursales', required: false, where: { id_sucursal: Number(sucursalId), status: { [Op.ne]: false } } }],
    order: [['full_names', 'ASC']],
  });
  return users.filter((user) => user.role === 'ADMINISTRADOR' || user.assign_sucursales?.length > 0);
};

const assertNoOpenConflicts = async ({ record, transaction }) => {
  const otherCase = await StockReconciliationCase.findOne({
    where: {
      id: { [Op.ne]: record.id }, id_product: record.id_product,
      id_sucursal: record.id_sucursal, id_storage: record.id_storage,
      status: { [Op.ne]: STATUSES.RESOLVED },
    }, transaction, lock: transaction?.LOCK?.UPDATE,
  });
  if (otherCase) throw serviceError(`La conciliación Stock–Kardex #${otherCase.id} sigue abierta para este producto y ubicación.`, 409, { blocking_case_id: otherCase.id });
  const [review] = await sequelize.query(`
    SELECT n.id, n.registry_number
    FROM transfer_review_note_details d
    INNER JOIN transfer_review_notes n ON n.id = d.id_transfer_review_note
    LEFT JOIN details_transfers t ON t.id = d.id_detail_transfer
    WHERE n.id_sucursal = :sucursalId AND n.id_storage = :storageId
      AND n.management_status = 'ACTIVA' AND n.reconciliation_status <> 'COMPLETADO'
      AND d.reconciliation_status <> 'COMPLETADO'
      AND (d.id_product = :productId OR t.id_product = :productId)
    ORDER BY n.id ASC LIMIT 1
  `, { replacements: { productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage }, type: QueryTypes.SELECT, transaction });
  if (review) throw serviceError(`La conciliación de recepción ${review.registry_number || `#${review.id}`} está abierta para este producto y ubicación.`, 409, { blocking_review_note_id: review.id, blocking_review_registry: review.registry_number });
};

const listAuthorizers = async ({ sucursalId }) => {
  const users = await User.findAll({
    where: { status: true },
    attributes: ['id', 'full_names', 'role'],
    include: [
      { association: 'assign_permission', required: false, where: { module: 'STOCK_RECONCILIATION', status: { [Op.ne]: false } } },
      { association: 'assign_sucursales', required: false, where: { id_sucursal: Number(sucursalId), status: { [Op.ne]: false } } },
    ],
    order: [['full_names', 'ASC']],
  });
  return users.filter((user) => user.role === 'ADMINISTRADOR' || (
    user.assign_sucursales?.length > 0 && user.assign_permission?.some(({ reports }) => reports === true)
  ));
};

const detectCases = async ({ idSucursal, idStorage, actorUserId, limit = 2000 }) => {
  const irregularities = await getStockKardexIrregularities({ idSucursal, idStorage, limit });
  const cases = [];
  for (const item of irregularities) {
    const fingerprint = fingerprintFor(item);
    const values = {
      fingerprint,
      direction: directionFor(item.physical_kardex_difference),
      physical_stock_observed: normalizeNumber(item.physical_stock),
      kardex_balance_observed: normalizeNumber(item.kardex_balance),
      difference_observed: normalizeNumber(item.physical_kardex_difference),
      candidate_documents: item.traceable_transfers || [],
      last_detected_at: new Date(),
    };
    const [record, created] = await sequelize.transaction(async (transaction) => {
      let current = await StockReconciliationCase.findOne({
        where: {
          id_product: item.id_product, id_sucursal: item.id_sucursal, id_storage: item.id_storage,
          status: { [Op.ne]: STATUSES.RESOLVED },
        }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (current) {
        await current.update(values, { transaction });
        return [current, false];
      }
      current = await StockReconciliationCase.create({
        ...values, status: STATUSES.DETECTED, detected_at: new Date(),
        id_product: item.id_product, id_sucursal: item.id_sucursal, id_storage: item.id_storage,
      }, { transaction });
      await createEvent({ caseId: current.id, userId: actorUserId, type: 'DETECTADA', description: 'Diferencia Stock–Kardex detectada sin modificar inventario.', metadata: values, transaction });
      return [current, true];
    });
    cases.push({ ...record.toJSON(), created });
  }
  return { cases, detected: irregularities.length, created: cases.filter((item) => item.created).length };
};

const listCases = async ({ page = 1, limit = 25, idSucursal, idStorage, status, direction, query }) => {
  const normalizedPage = Math.max(1, Number(page) || 1);
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const where = {
    ...(idSucursal ? { id_sucursal: Number(idSucursal) } : {}),
    ...(idStorage ? { id_storage: Number(idStorage) } : {}),
    ...(status ? { status } : {}),
    ...(direction ? { direction } : {}),
  };
  const result = await StockReconciliationCase.findAndCountAll({
    where,
    include: caseInclude,
    distinct: true,
    order: [['status', 'ASC'], ['last_detected_at', 'ASC'], ['id', 'ASC']],
  });
  let rows = result.rows;
  if (query) {
    const normalized = String(query).trim().toLowerCase();
    rows = rows.filter((item) => item.product?.cod?.toLowerCase().includes(normalized) || item.product?.name?.toLowerCase().includes(normalized));
  }
  const offset = (normalizedPage - 1) * normalizedLimit;
  return { data: rows.slice(offset, offset + normalizedLimit), total: rows.length, page: normalizedPage, limit: normalizedLimit };
};

const getCase = async (id, options = {}) => {
  const record = await StockReconciliationCase.findByPk(id, { include: caseInclude, ...options });
  if (!record) throw serviceError('Caso Stock–Kardex no encontrado.', 404);
  return record;
};

const investigateCase = async ({ caseId, actorUserId, physicalCount, cause, notes, strategy, assignedUserId, sourceReferenceType, sourceReferenceCode, evidences = [] }) => sequelize.transaction(async (transaction) => {
  const record = await StockReconciliationCase.findByPk(caseId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!record) throw serviceError('Caso Stock–Kardex no encontrado.', 404);
  if (record.status === STATUSES.RESOLVED) throw serviceError('El caso ya fue resuelto.', 409);
  const errors = investigationErrors({ physicalCount, cause, notes, strategy, assignedUserId, evidences, sourceReferenceCode });
  if (errors.length) throw serviceError(errors[0], 422, errors);
  if (strategy !== STRATEGIES.CONTINUE_INVESTIGATION) await validateCountResponsible({ userId: assignedUserId, sucursalId: record.id_sucursal, transaction });
  const ready = strategy !== STRATEGIES.CONTINUE_INVESTIGATION;
  const nextStatus = ready ? STATUSES.READY : STATUSES.INVESTIGATING;
  assertStatusTransition(record.status, nextStatus);
  await record.update({
    physical_count: physicalCount === '' || physicalCount === null || physicalCount === undefined ? null : normalizeNumber(physicalCount),
    cause: String(cause || '').trim() || null,
    investigation_notes: String(notes || '').trim(),
    selected_strategy: strategy,
    source_reference_type: String(sourceReferenceType || '').trim() || null,
    source_reference_code: String(sourceReferenceCode || '').trim() || null,
    id_assigned_user: assignedUserId || actorUserId,
    status: nextStatus,
  }, { transaction });
  for (const evidence of evidences) {
    await StockReconciliationEvidence.create({
      id_stock_reconciliation_case: record.id, id_user: actorUserId,
      evidence_type: String(evidence.evidence_type || 'REFERENCIA').trim(),
      reference: String(evidence.reference || '').trim(),
      description: String(evidence.description || '').trim(),
    }, { transaction });
  }
  await StockReconciliationDecision.create({
    id_stock_reconciliation_case: record.id,
    id_user: actorUserId,
    strategy,
    physical_count: record.physical_count,
    cause: record.cause,
    notes: record.investigation_notes || '',
    source_reference_type: record.source_reference_type,
    source_reference_code: record.source_reference_code,
  }, { transaction });
  await createEvent({
    caseId: record.id, userId: actorUserId, type: ready ? 'LISTA_PARA_REGULARIZAR' : 'SEGUIMIENTO',
    description: ready ? 'Diagnóstico completado; el caso requiere previsualización y autorización.' : record.investigation_notes,
    metadata: { strategy, physical_count: record.physical_count, cause: record.cause, source_reference_code: record.source_reference_code }, transaction,
  });
  return getCase(record.id, { transaction });
});

const previewCase = async (caseId) => {
  const record = await getCase(caseId);
  if (record.status !== STATUSES.READY) throw serviceError('Complete la investigación antes de previsualizar una regularización.', 409);
  const { snapshot } = await getCurrentSnapshot({ productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage });
  if (snapshot.fingerprint !== record.fingerprint && record.selected_strategy !== STRATEGIES.LINK_EXISTING) {
    throw serviceError('Los saldos cambiaron desde el diagnóstico. Actualice el caso antes de continuar.', 409, { current_snapshot: snapshot });
  }
  if (record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) await assertNoOpenConflicts({ record });
  const preview = {
    case_id: record.id, fingerprint: snapshot.fingerprint,
    ...buildPreview({ strategy: record.selected_strategy, stock: snapshot.physical_stock, kardex: snapshot.kardex_balance, physicalCount: record.physical_count, sourceReferenceCode: record.source_reference_code }),
  };
  if (record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) preview.registry_number = `AKFP-${record.id}`;
  return preview;
};

const resolveCase = async ({ caseId, actorUserId, authorizedUserId, idempotencyKey }) => {
  if (process.env.STOCK_RECONCILIATION_WRITE_ENABLED === 'false') throw serviceError('Las regularizaciones están temporalmente deshabilitadas.', 409);
  if (!String(idempotencyKey || '').trim()) throw serviceError('La clave de confirmación es obligatoria.');
  if (!Number(authorizedUserId)) throw serviceError('Seleccione un autorizador.');
  const previous = await StockReconciliationAction.findOne({ where: { idempotency_key: idempotencyKey }, include: [{ association: 'case' }] });
  if (previous) return { action: previous, case: previous.case, repeated: true };
  return sequelize.transaction(async (transaction) => {
    const record = await StockReconciliationCase.findByPk(caseId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!record) throw serviceError('Caso Stock–Kardex no encontrado.', 404);
    if (record.status === STATUSES.RESOLVED) throw serviceError('El caso ya fue resuelto.', 409);
    if (record.status !== STATUSES.READY) throw serviceError('El caso todavía no está listo para regularizar.', 409);
    await validateAuthorizer({ authorizerUserId: Number(authorizedUserId), sucursalId: record.id_sucursal, transaction });
    if (record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) {
      await validateCountResponsible({ userId: record.id_assigned_user, sucursalId: record.id_sucursal, transaction });
      await assertNoOpenConflicts({ record, transaction });
    }
    const evidenceCount = await StockReconciliationEvidence.count({ where: { id_stock_reconciliation_case: record.id }, transaction });
    if (!evidenceCount) throw serviceError('El caso no tiene evidencia verificable.', 422);
    const { stock, snapshot } = await getCurrentSnapshot({ productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage, transaction, lock: true });
    if (snapshot.fingerprint !== record.fingerprint && record.selected_strategy !== STRATEGIES.LINK_EXISTING) {
      throw serviceError('Los saldos cambiaron desde el diagnóstico. Actualice el caso antes de confirmar.', 409, { current_snapshot: snapshot });
    }
    const preview = buildPreview({ strategy: record.selected_strategy, stock: snapshot.physical_stock, kardex: snapshot.kardex_balance, physicalCount: record.physical_count, sourceReferenceCode: record.source_reference_code });
    const authorization = await StockReconciliationAuthorization.create({
      id_stock_reconciliation_case: record.id,
      id_requested_user: actorUserId,
      id_authorized_user: authorizedUserId,
      strategy: record.selected_strategy,
      snapshot_fingerprint: snapshot.fingerprint,
      status: 'AUTORIZADA',
      authorized_at: new Date(),
    }, { transaction });
    let movement = null;
    const registryNumber = record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT ? `AKFP-${record.id}` : `RSK-${record.id}`;
    const priorAkfp = await StockReconciliationAction.findOne({
      where: { id_stock_reconciliation_case: record.id, registry_number: registryNumber, status: 'CONFIRMADA' }, transaction,
    });
    if (priorAkfp) return { action: priorAkfp, case: record, repeated: true };
    if (record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT) {
      if (preview.movement) {
        ({ movement } = await registerKardexOnlyEffect({
          productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage,
          quantity: preview.movement.quantity, direction: preview.movement.type, actorUserId,
          date: new Date(), registryNumber, sourceType: 'STOCK_RECONCILIATION_AKFP', sourceId: record.id,
          effectType: 'AJUSTE_KARDEX_FISICO_PRODUCCION', idempotencyKey: `AKFP:${record.id}`, transaction,
          details: `AJUSTE KARDEX FÍSICO-PRODUCCIÓN ${registryNumber}: ${record.cause}`,
        }));
      }
      await applyStockDelta({
        productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage,
        delta: decimalSubtract(preview.stock_after, stock.stock), transaction,
      });
    } else if (record.selected_strategy === STRATEGIES.REGISTER_MISSING_KARDEX) {
      if (preview.movement.quantity <= getEpsilon()) throw serviceError('No existe una diferencia que requiera movimiento Kardex.', 409);
      movement = await kardexMovements.create({
        type: preview.movement.type, date: new Date(),
        details: `REGULARIZACIÓN STOCK-KARDEX CASO #${record.id}: ${record.cause}`,
        quantity: preview.movement.quantity, cost: 0, price: 0, total: 0,
        id_product: record.id_product, id_user: actorUserId, id_sucursal: record.id_sucursal,
        id_storage: record.id_storage, status: true, registry_number: registryNumber,
      }, { transaction });
    } else if (record.selected_strategy === STRATEGIES.ADJUST_STOCK_BY_COUNT) {
      await applyStockDelta({
        productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage,
        delta: decimalSubtract(preview.stock_after, stock.stock), transaction,
      });
    }
    const { snapshot: after } = await getCurrentSnapshot({ productId: record.id_product, sucursalId: record.id_sucursal, storageId: record.id_storage, transaction });
    const resolved = Math.abs(after.physical_kardex_difference) <= getEpsilon();
    const nextStatus = resolved ? STATUSES.RESOLVED : STATUSES.INVESTIGATING;
    assertStatusTransition(record.status, nextStatus);
    const action = await StockReconciliationAction.create({
      idempotency_key: String(idempotencyKey).trim(), strategy: record.selected_strategy, registry_number: registryNumber,
      count_description: record.investigation_notes, id_count_responsible_user: record.id_assigned_user,
      stock_before: snapshot.physical_stock, kardex_before: snapshot.kardex_balance,
      stock_after: after.physical_stock, kardex_after: after.kardex_balance,
      difference_after: after.physical_kardex_difference,
      id_stock_reconciliation_case: record.id, id_kardex_movement: movement?.id || null,
      id_user: actorUserId, id_authorized_user: authorizedUserId,
    }, { transaction });
    await record.update({
      status: nextStatus,
      fingerprint: after.fingerprint,
      physical_stock_observed: after.physical_stock,
      kardex_balance_observed: after.kardex_balance,
      difference_observed: after.physical_kardex_difference,
      id_authorized_user: authorizedUserId, authorized_at: new Date(),
      id_resolved_user: resolved ? actorUserId : null, resolved_at: resolved ? new Date() : null,
    }, { transaction });
    await createEvent({
      caseId: record.id, userId: actorUserId, type: resolved ? 'RESUELTA' : 'DIFERENCIA_RESIDUAL',
      description: resolved ? 'Regularización confirmada y diferencia Stock–Kardex verificada en cero.' : 'La acción terminó, pero el caso conserva una diferencia residual.',
      metadata: { action_id: action.id, authorization_id: authorization.id, strategy: action.strategy, registry_number: registryNumber, movement_id: movement?.id || null, snapshot_before: snapshot, snapshot_after: after }, transaction,
    });
    await History.create({
      id_user: actorUserId, id_sucursal: record.id_sucursal, id_reference: record.id,
      description: `${record.selected_strategy === STRATEGIES.ADJUST_BOTH_TO_PHYSICAL_COUNT ? 'AJUSTE KARDEX FÍSICO-PRODUCCIÓN' : 'REGULARIZACIÓN STOCK-KARDEX'} ${registryNumber}: ${record.selected_strategy}`,
      type: 'REGULARIZACIÓN STOCK-KARDEX', module: 'STOCK_RECONCILIATION', action: 'UPDATE',
      query: JSON.stringify({ action_id: action.id, snapshot_before: snapshot, snapshot_after: after }), status: true,
    }, { transaction });
    return { action, case: record, repeated: false };
  });
};

const resolveCases = async ({ cases, actorUserId }) => {
  const results = [];
  for (const item of cases || []) {
    try {
      const result = await resolveCase({ caseId: item.case_id, actorUserId, authorizedUserId: item.authorized_user_id, idempotencyKey: item.idempotency_key });
      results.push({ case_id: item.case_id, ok: true, result });
    } catch (error) {
      results.push({ case_id: item.case_id, ok: false, error: error.message, statusCode: error.statusCode || 500 });
    }
  }
  return results;
};

module.exports = {
  fingerprintFor,
  directionFor,
  getCurrentSnapshot,
  detectCases,
  listCases,
  getCase,
  investigateCase,
  previewCase,
  resolveCase,
  resolveCases,
  validateAuthorizer,
  listAuthorizers,
  validateCountResponsible,
  listCountResponsibles,
  assertNoOpenConflicts,
};

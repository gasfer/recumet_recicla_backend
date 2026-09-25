'use strict';

const { createHash } = require('crypto');
const { Op, QueryTypes } = require('sequelize');
const {
  sequelize,
  Transfers,
  Stock,
  Product,
  kardexMovements,
  TransferReviewNote,
  TransferReviewNoteDetail,
  TransferReviewInventoryHold,
  TransferReviewEvent,
  TransferHistoricalDifferenceCompletion,
  History,
} = require('../database/config');
const { createTransferReviewNote } = require('./transfer-review-note.service');
const { increaseStock } = require('./inventory-operation.service');
const {
  buildHistoricalVerification,
  inventoryProjection,
} = require('./transfer-reconciliation-registration-verification.service');
const { REVIEW_HOLD_DISPOSITIONS } = require('../constants/transfer-review');
const {
  HISTORICAL_DIFFERENCE_TYPES: TYPES,
  HISTORICAL_RECONCILIATION_STATUSES: STATUSES,
  HISTORICAL_EVIDENCE_CONFIDENCE: CONFIDENCE,
  HISTORICAL_COMPLETION_ACTIONS: ACTIONS,
} = require('../constants/historical-transfer-difference');

const EPSILON_UNITS = 1;
const { toScaledInteger, decimalToNumber, decimalToString } = require('../helpers/number-formatter');

const operationError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const toUnits = (value) => toScaledInteger(value || 0);
const fromUnits = (value) => decimalToNumber(value || 0);
const approximatelyEqual = (left, right) => {
  const difference = toUnits(left) - toUnits(right);
  return (difference < 0n ? -difference : difference) <= BigInt(EPSILON_UNITS);
};

const expectedDifference = (detail) => {
  const sent = toUnits(detail.quantity);
  if (detail.quantity_received === null || detail.quantity_received === undefined || detail.quantity_received === '') {
    return {
      type: TYPES.UNDETERMINED,
      sent: fromUnits(sent),
      received: null,
      baseExpected: null,
      differenceExpected: null,
    };
  }
  const received = toUnits(detail.quantity_received);
  if (received === sent) {
    return { type: TYPES.EXACT, sent: fromUnits(sent), received: fromUnits(received), baseExpected: fromUnits(sent), differenceExpected: 0 };
  }
  if (received > sent) {
    return { type: TYPES.SURPLUS, sent: fromUnits(sent), received: fromUnits(received), baseExpected: fromUnits(sent), differenceExpected: fromUnits(received - sent) };
  }
  return { type: TYPES.SHORTAGE, sent: fromUnits(sent), received: fromUnits(received), baseExpected: fromUnits(received), differenceExpected: fromUnits(sent - received) };
};

const allocateCoveredQuantity = (items, coveredQuantity) => {
  let remainingUnits = toUnits(coveredQuantity);
  if (remainingUnits < 0n) remainingUnits = 0n;
  return [...items].sort((left, right) => Number(left.id) - Number(right.id)).map((item) => {
    const expectedUnits = toUnits(item.difference_expected);
    const coveredUnits = expectedUnits < remainingUnits ? expectedUnits : remainingUnits;
    remainingUnits -= coveredUnits;
    return { id: item.id, covered: fromUnits(coveredUnits), pending: fromUnits(expectedUnits - coveredUnits) };
  });
};

const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const transferInclude = [
  { association: 'sucursal_received', attributes: ['id', 'name'] },
  { association: 'storage_received', attributes: ['id', 'name'] },
  { association: 'detailsTransfers', include: [{ association: 'product', attributes: ['id', 'cod', 'name'] }] },
  { association: 'reviewNotes', required: false, include: [
    { association: 'registeredProduct', attributes: ['id', 'cod', 'name'] },
    { association: 'kardexMovement' },
    { association: 'details', include: [{ association: 'product', attributes: ['id', 'cod', 'name'] }] },
  ] },
  { association: 'historicalDifferenceCompletions', required: false, include: [
    { association: 'registeredProduct', attributes: ['id', 'cod', 'name'] },
    { association: 'kardexMovement' },
  ] },
];

const loadTransfer = async (transferId, { transaction, lock = false } = {}) => {
  const transfer = await Transfers.findByPk(transferId, {
    include: transferInclude,
    transaction,
    ...(lock && transaction ? { lock: { level: transaction.LOCK.UPDATE, of: Transfers } } : {}),
  });
  if (!transfer) throw operationError('Traslado no encontrado.', 404);
  return transfer;
};

const loadBaseRows = async (transfer, transaction) => sequelize.query(`
  SELECT id_product, SUM(quantity) AS quantity
  FROM view_kardex_detalle
  WHERE type_movement = 'TRANSFER' AND type = 'INPUT'
    AND id_movement = :transferId
    AND id_sucursal = :sucursalId AND id_storage = :storageId
  GROUP BY id_product
`, {
  replacements: {
    transferId: transfer.id,
    sucursalId: transfer.id_sucursal_received,
    storageId: transfer.id_storage_received,
  },
  type: QueryTypes.SELECT,
  transaction,
});

const loadLatestInventory = async (transfer, productIds, transaction) => {
  if (productIds.length === 0) return new Map();
  const [stocks, kardexRows] = await Promise.all([
    Stock.findAll({
      where: {
        id_product: { [Op.in]: productIds },
        id_sucursal: transfer.id_sucursal_received,
        id_storage: transfer.id_storage_received,
        status: true,
      },
      transaction,
    }),
    sequelize.query(`
      SELECT DISTINCT ON (id_product) id_product, saldo
      FROM view_kardex_detalle
      WHERE id_product IN (:productIds)
        AND id_sucursal = :sucursalId AND id_storage = :storageId
      ORDER BY id_product, date DESC, id DESC
    `, {
      replacements: {
        productIds,
        sucursalId: transfer.id_sucursal_received,
        storageId: transfer.id_storage_received,
      },
      type: QueryTypes.SELECT,
      transaction,
    }),
  ]);
  const stockMap = new Map(stocks.map((stock) => [Number(stock.id_product), Number(stock.stock)]));
  const kardexMap = new Map(kardexRows.map((row) => [Number(row.id_product), Number(row.saldo)]));
  return new Map(productIds.map((productId) => {
    const stock = stockMap.get(Number(productId)) || 0;
    const kardex = kardexMap.get(Number(productId)) || 0;
    return [Number(productId), { stock, kardex, difference: fromUnits(toUnits(stock) - toUnits(kardex)) }];
  }));
};

const loadCandidateMovements = async (transfer, transaction) => kardexMovements.findAll({
  where: {
    type: 'INPUT',
    status: true,
    id_sucursal: transfer.id_sucursal_received,
    id_storage: transfer.id_storage_received,
    registry_number: transfer.registry_number,
    [Op.or]: [
      { details: { [Op.like]: `EXCEDENTE TRASPASO #${transfer.cod}%` } },
      { details: { [Op.like]: `MERMA TRASPASO #${transfer.cod}%` } },
      { details: { [Op.like]: `REGULARIZACION EXCEDENTE TRASPASO #${transfer.cod}%` } },
      { details: { [Op.like]: `REGULARIZACION FALTANTE TRASPASO #${transfer.cod}%` } },
    ],
  },
  transaction,
});

const movementView = (movement, confidence, product) => ({
  id: Number(movement.id),
  type: movement.type,
  quantity: Number(movement.quantity),
  details: movement.details,
  registry_number: movement.registry_number,
  id_product: Number(movement.id_product),
  product: product ? { id: Number(product.id), cod: product.cod, name: product.name } : null,
  confidence,
});

const collectLinkedMovementIds = (transfer, detailId, noteType) => {
  const ids = new Set();
  for (const note of transfer.reviewNotes || []) {
    if (note.management_status === 'ELIMINADA' || note.type !== noteType) continue;
    if ((note.details || []).some((detail) => Number(detail.id_detail_transfer) === Number(detailId)) && note.kardexMovement?.id) {
      ids.add(Number(note.kardexMovement.id));
    }
  }
  for (const completion of transfer.historicalDifferenceCompletions || []) {
    if (completion.status !== 'ACTIVE') continue;
    const allocated = (completion.allocations || []).some(({ id_detail_transfer: allocatedId }) => Number(allocatedId) === Number(detailId));
    if ((Number(completion.id_detail_transfer) === Number(detailId) || allocated) && completion.kardexMovement?.id) {
      ids.add(Number(completion.kardexMovement.id));
    }
  }
  return ids;
};

const reviewNoteForItem = (transfer, item) => {
  const noteType = item.difference_type === TYPES.SURPLUS ? 'EXCEDENTE_PARA_REVISION' : 'FALTANTE_PARA_REVISION';
  return (transfer.reviewNotes || []).find((note) => note.management_status !== 'ELIMINADA'
    && note.type === noteType
    && (note.details || []).some(({ id_detail_transfer }) => Number(id_detail_transfer) === Number(item.id)));
};

const historicalVerificationInventory = (item) => {
  const stock = item.registered_stock ?? item.stock;
  const kardex = item.registered_kardex ?? item.kardex;
  if (Number(item.difference_covered || 0) > 0) {
    return {
      before_stock: stock,
      before_kardex: kardex,
      after_stock: stock,
      after_kardex: kardex,
    };
  }
  return inventoryProjection({
    stock,
    kardex,
    quantity: item.allowed_action?.quantity ?? item.difference_pending,
    differenceType: item.difference_type,
  });
};

const applyRegistrationVerification = (transfer, item) => {
  if (![TYPES.SURPLUS, TYPES.SHORTAGE].includes(item.difference_type)) return;
  item.registration_verification = buildHistoricalVerification({
    transfer,
    item,
    note: reviewNoteForItem(transfer, item),
    inventory: historicalVerificationInventory(item),
  });
  if (!item.registration_verification.is_blocked) return;
  item.allowed_action = null;
  if (item.registration_verification.status === 'REGISTRO_PARCIAL') {
    item.reconciliation_status = STATUSES.PARTIAL;
  } else if (item.registration_verification.status === 'REGISTRO_EXISTENTE') {
    item.reconciliation_status = STATUSES.COMPLETE;
  } else {
    item.reconciliation_status = STATUSES.NOT_ATTRIBUTABLE;
  }
  item.message = item.registration_verification.message;
};

const buildProjection = async (transfer, { transaction } = {}) => {
  const details = (transfer.detailsTransfers || []).map((detail) => {
    const expected = expectedDifference(detail);
    return {
      id: Number(detail.id),
      id_product: Number(detail.id_product),
      product: detail.product ? { id: Number(detail.product.id), cod: detail.product.cod, name: detail.product.name } : null,
      observation: detail.observation || null,
      difference_type: expected.type,
      sent: expected.sent,
      received: expected.received,
      base_expected: expected.baseExpected,
      difference_expected: expected.differenceExpected,
      tolerance_decision: detail.tolerance_decision || null,
      accounting_status: detail.accounting_status || null,
    };
  });
  const [baseRows, queriedMovements] = await Promise.all([
    loadBaseRows(transfer, transaction),
    loadCandidateMovements(transfer, transaction),
  ]);
  const relatedMovements = [
    ...(transfer.reviewNotes || []).map(({ kardexMovement }) => kardexMovement).filter(Boolean),
    ...(transfer.historicalDifferenceCompletions || []).map(({ kardexMovement }) => kardexMovement).filter(Boolean),
  ];
  const candidateMovements = [...new Map([...queriedMovements, ...relatedMovements]
    .map((movement) => [Number(movement.id), movement])).values()];
  const baseByProduct = new Map(baseRows.map((row) => [Number(row.id_product), Number(row.quantity)]));
  const productIds = new Set(details.map(({ id_product: productId }) => productId));
  for (const note of transfer.reviewNotes || []) if (note.id_product) productIds.add(Number(note.id_product));
  for (const movement of candidateMovements) productIds.add(Number(movement.id_product));
  const products = await Product.findAll({
    where: { id: { [Op.in]: [...productIds] } },
    include: [{ association: 'category', attributes: ['id', 'name', 'type', 'status'] }],
    transaction,
  });
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  const inventory = await loadLatestInventory(transfer, [...productIds], transaction);
  const linkedMovementIds = new Set();
  for (const detail of details) {
    const noteType = detail.difference_type === TYPES.SURPLUS ? 'EXCEDENTE_PARA_REVISION' : 'FALTANTE_PARA_REVISION';
    for (const id of collectLinkedMovementIds(transfer, detail.id, noteType)) linkedMovementIds.add(id);
  }

  const surplusItemsByProduct = new Map();
  for (const detail of details.filter(({ difference_type: type }) => type === TYPES.SURPLUS)) {
    const current = surplusItemsByProduct.get(detail.id_product) || [];
    current.push(detail);
    surplusItemsByProduct.set(detail.id_product, current);
  }

  const projected = details.map((detail) => {
    const originalInventory = inventory.get(detail.id_product) || { stock: 0, kardex: 0, difference: 0 };
    const sameProductDetails = details.filter(({ id_product: productId }) => productId === detail.id_product);
    const baseFound = sameProductDetails.length === 1 ? fromUnits(toUnits(baseByProduct.get(detail.id_product))) : null;
    const baseConfidence = sameProductDetails.length === 1 ? CONFIDENCE.LINKED : CONFIDENCE.AMBIGUOUS;
    if (detail.difference_type === TYPES.UNDETERMINED) {
      return {
        ...detail, base_found: baseFound, base_confidence: baseConfidence, difference_covered: 0, difference_pending: null,
        registered_product: null, difference_movements: [], evidence_confidence: CONFIDENCE.NOT_FOUND,
        stock: originalInventory.stock, kardex: originalInventory.kardex, stock_kardex_difference: originalInventory.difference,
        registered_stock: null, registered_kardex: null, registered_stock_kardex_difference: null,
        reconciliation_status: STATUSES.UNDETERMINED, allowed_action: null,
        message: 'No existe un peso recibido confiable para determinar excedente o faltante.',
      };
    }
    if (detail.difference_type === TYPES.EXACT) {
      const baseConsistent = approximatelyEqual(baseFound, detail.base_expected);
      const inventoryConsistent = approximatelyEqual(originalInventory.difference, 0);
      return {
        ...detail, base_found: baseFound, base_confidence: baseConfidence, difference_covered: 0, difference_pending: 0,
        registered_product: detail.product, difference_movements: [], evidence_confidence: CONFIDENCE.LINKED,
        stock: originalInventory.stock, kardex: originalInventory.kardex, stock_kardex_difference: originalInventory.difference,
        registered_stock: originalInventory.stock, registered_kardex: originalInventory.kardex,
        registered_stock_kardex_difference: originalInventory.difference,
        reconciliation_status: baseConsistent && inventoryConsistent ? STATUSES.COMPLETE : STATUSES.NOT_ATTRIBUTABLE,
        allowed_action: null,
        message: baseConsistent && inventoryConsistent
          ? 'El peso enviado y recibido coincide.'
          : 'La boleta es exacta, pero sus registros actuales requieren investigación.',
      };
    }
    return {
      ...detail,
      base_found: baseFound,
      base_confidence: baseConfidence,
      stock: originalInventory.stock,
      kardex: originalInventory.kardex,
      stock_kardex_difference: originalInventory.difference,
    };
  });

  for (const item of projected.filter(({ difference_type: type }) => type === TYPES.SURPLUS)) {
    const linkedIds = collectLinkedMovementIds(transfer, item.id, 'EXCEDENTE_PARA_REVISION');
    const matching = candidateMovements.filter((movement) => Number(movement.id_product) === item.id_product && /EXCEDENTE/i.test(movement.details || ''));
    const linked = matching.filter((movement) => linkedIds.has(Number(movement.id)));
    const unlinked = matching.filter((movement) => !linkedMovementIds.has(Number(movement.id)));
    const ambiguous = unlinked.length > 1 || (unlinked.length === 1 && (surplusItemsByProduct.get(item.id_product) || []).length > 1);
    const accepted = [...linked, ...(!ambiguous && unlinked.length === 1 ? unlinked : [])];
    const unique = [...new Map(accepted.map((movement) => [Number(movement.id), movement])).values()];
    const covered = Math.min(Number(item.difference_expected), unique.reduce((sum, movement) => sum + Number(movement.quantity), 0));
    const pending = fromUnits(toUnits(item.difference_expected) - toUnits(covered));
    const baseConsistent = item.base_confidence !== CONFIDENCE.AMBIGUOUS && approximatelyEqual(item.base_found, item.base_expected);
    const attributable = approximatelyEqual(item.stock_kardex_difference, pending);
    const confidence = ambiguous ? CONFIDENCE.AMBIGUOUS : linked.length > 0 ? CONFIDENCE.LINKED : unique.length === 1 ? CONFIDENCE.UNIQUE_MATCH : CONFIDENCE.NOT_FOUND;
    item.difference_movements = unique.map((movement) => movementView(movement, linkedIds.has(Number(movement.id)) ? CONFIDENCE.LINKED : CONFIDENCE.UNIQUE_MATCH, productMap.get(item.id_product)));
    item.evidence_confidence = confidence;
    item.difference_covered = fromUnits(toUnits(covered));
    item.difference_pending = Math.max(0, pending);
    item.registered_product = item.product;
    item.registered_stock = item.stock;
    item.registered_kardex = item.kardex;
    item.registered_stock_kardex_difference = item.stock_kardex_difference;
    if (ambiguous || !baseConsistent || !attributable) {
      item.reconciliation_status = STATUSES.NOT_ATTRIBUTABLE;
      item.allowed_action = null;
      item.message = ambiguous ? 'Existen movimientos candidatos ambiguos.' : 'La diferencia actual no puede atribuirse únicamente a esta boleta.';
    } else if (pending > 0) {
      item.reconciliation_status = covered > 0 ? STATUSES.PARTIAL : STATUSES.SURPLUS_PENDING_KARDEX;
      item.allowed_action = { code: ACTIONS.REGISTER_SURPLUS, label: `Registrar excedente de ${decimalToString(pending)} kg`, quantity: pending, scope: 'ITEM', requires_merma_product: false };
      item.message = 'Stock contiene el peso recibido y falta completar el ingreso adicional en Kardex.';
    } else {
      item.reconciliation_status = STATUSES.COMPLETE;
      item.allowed_action = null;
      item.message = 'El excedente ya está registrado.';
    }
  }

  const shortageItems = projected.filter(({ difference_type: type }) => type === TYPES.SHORTAGE);
  if (shortageItems.length > 0) {
    const expectedTotal = shortageItems.reduce((sum, item) => sum + Number(item.difference_expected), 0);
    const shortageLinkedIds = new Set();
    for (const item of shortageItems) for (const id of collectLinkedMovementIds(transfer, item.id, 'FALTANTE_PARA_REVISION')) shortageLinkedIds.add(id);
    const matching = candidateMovements.filter((movement) => /MERMA|FALTANTE/i.test(movement.details || ''));
    const linked = matching.filter((movement) => shortageLinkedIds.has(Number(movement.id)));
    const unlinked = matching.filter((movement) => !linkedMovementIds.has(Number(movement.id)));
    const ambiguous = unlinked.length > 1 || new Set(matching.map((movement) => Number(movement.id_product))).size > 1;
    const accepted = [...linked, ...(!ambiguous && unlinked.length === 1 ? unlinked : [])];
    const unique = [...new Map(accepted.map((movement) => [Number(movement.id), movement])).values()];
    const coveredTotal = Math.min(expectedTotal, unique.reduce((sum, movement) => sum + Number(movement.quantity), 0));
    const allocations = allocateCoveredQuantity(shortageItems, coveredTotal);
    const registeredProductId = unique[0]?.id_product || (transfer.reviewNotes || []).find(({ type }) => type === 'FALTANTE_PARA_REVISION')?.id_product || null;
    const registeredProduct = registeredProductId ? productMap.get(Number(registeredProductId)) : null;
    const validMerma = registeredProduct?.status !== false
      && registeredProduct?.category?.status !== false
      && registeredProduct?.category?.name === 'MERMAS'
      && registeredProduct?.category?.type === 'RAW_MATERIAL';
    const confidence = ambiguous ? CONFIDENCE.AMBIGUOUS : linked.length > 0 ? CONFIDENCE.LINKED : unique.length === 1 ? CONFIDENCE.UNIQUE_MATCH : CONFIDENCE.NOT_FOUND;
    const movementViews = unique.map((movement) => movementView(movement, shortageLinkedIds.has(Number(movement.id)) ? CONFIDENCE.LINKED : CONFIDENCE.UNIQUE_MATCH, productMap.get(Number(movement.id_product))));
    const totalPending = fromUnits(toUnits(expectedTotal) - toUnits(coveredTotal));
    const actionDetailId = allocations.find(({ pending }) => Number(pending) > 0)?.id || null;
    const mermaInventory = registeredProductId ? inventory.get(Number(registeredProductId)) : null;
    for (const item of shortageItems) {
      const allocation = allocations.find(({ id }) => id === item.id);
      item.difference_covered = allocation.covered;
      item.difference_pending = allocation.pending;
      item.difference_movements = movementViews;
      item.evidence_confidence = confidence;
      item.registered_product = registeredProduct ? { id: Number(registeredProduct.id), cod: registeredProduct.cod, name: registeredProduct.name } : null;
      item.registered_stock = mermaInventory?.stock ?? null;
      item.registered_kardex = mermaInventory?.kardex ?? null;
      item.registered_stock_kardex_difference = mermaInventory?.difference ?? null;
      const originalInventoryConsistent = approximatelyEqual(item.stock_kardex_difference, 0);
      const mermaInventoryConsistent = !mermaInventory || approximatelyEqual(mermaInventory.difference, 0);
      if (ambiguous || item.base_confidence === CONFIDENCE.AMBIGUOUS || !approximatelyEqual(item.base_found, item.base_expected)
        || !originalInventoryConsistent || !mermaInventoryConsistent || (registeredProduct && !validMerma)) {
        item.reconciliation_status = STATUSES.NOT_ATTRIBUTABLE;
        item.allowed_action = null;
        item.message = ambiguous ? 'Existen registros de faltante ambiguos.' : 'El registro base o el producto MERMAS no es válido para completar automáticamente.';
      } else if (totalPending > 0 && Number(allocation.pending) > 0) {
        item.reconciliation_status = Number(allocation.covered) > 0 ? STATUSES.PARTIAL : STATUSES.SHORTAGE_PENDING_WASTE;
        item.allowed_action = item.id === actionDetailId ? {
          code: ACTIONS.REGISTER_SHORTAGE,
          label: `Registrar faltante de ${decimalToString(totalPending)} kg en Merma traslado`,
          quantity: totalPending,
          scope: 'TRANSFER',
          requires_merma_product: !registeredProduct,
        } : null;
        item.message = item.id === actionDetailId
          ? 'Falta completar el registro consolidado del faltante en MERMAS.'
          : 'Este faltante forma parte de la regularización consolidada de la boleta.';
      } else {
        item.reconciliation_status = STATUSES.COMPLETE;
        item.allowed_action = null;
        item.message = 'El faltante ya está registrado en MERMAS.';
      }
    }
  }

  for (const item of projected) applyRegistrationVerification(transfer, item);

  const summary = {
    exact: projected.filter(({ difference_type: type }) => type === TYPES.EXACT).length,
    surplus: projected.filter(({ difference_type: type }) => type === TYPES.SURPLUS).length,
    shortage: projected.filter(({ difference_type: type }) => type === TYPES.SHORTAGE).length,
    undetermined: projected.filter(({ difference_type: type }) => type === TYPES.UNDETERMINED).length,
    actionable: projected.filter(({ allowed_action: action }) => Boolean(action)).length,
  };
  const projectionFingerprint = fingerprint({
    transfer_id: Number(transfer.id),
    transfer_updated_at: transfer.updatedAt,
    details: projected.map((item) => ({
      id: item.id,
      base_found: item.base_found,
      difference_covered: item.difference_covered,
      difference_pending: item.difference_pending,
      stock: item.stock,
      kardex: item.kardex,
      action: item.allowed_action?.code || null,
      registered_product_id: item.registered_product?.id || null,
      registered_stock: item.registered_stock,
      registered_kardex: item.registered_kardex,
    })),
  });
  return { transfer_id: Number(transfer.id), fingerprint: projectionFingerprint, summary, items: projected };
};

const getProjection = async (transferId, options = {}) => buildProjection(await loadTransfer(transferId, options), options);

const validateMermaProduct = async (productId, transaction) => {
  const product = await Product.findOne({
    where: { id: productId, status: true },
    include: [{ association: 'category', required: true, where: { name: 'MERMAS', type: 'RAW_MATERIAL', status: true } }],
    transaction,
  });
  if (!product) throw operationError('Seleccione un producto activo de la categoría MERMAS de Materia Prima.');
  return product;
};

const resolvePreviewAction = async ({ transferId, detailId, mermaProductId, transaction, lock = false }) => {
  const transfer = await loadTransfer(transferId, { transaction, lock });
  const projection = await buildProjection(transfer, { transaction });
  const item = projection.items.find(({ id }) => Number(id) === Number(detailId));
  if (!item) throw operationError('El ítem no pertenece al traslado.', 404);
  if (!item.allowed_action) throw operationError(item.message || 'Este ítem no tiene una regularización disponible.', 409);
  let registeredProduct = item.registered_product;
  if (item.allowed_action.code === ACTIONS.REGISTER_SHORTAGE) {
    const selectedId = mermaProductId || registeredProduct?.id;
    if (!selectedId) {
      return { transfer, projection, item, requires_merma_product: true, preview: null };
    }
    const product = await validateMermaProduct(Number(selectedId), transaction);
    if (registeredProduct && Number(registeredProduct.id) !== Number(product.id)) {
      throw operationError('El faltante ya está vinculado a otro producto MERMAS.', 409);
    }
    registeredProduct = { id: Number(product.id), cod: product.cod, name: product.name };
  }
  const inventory = item.allowed_action.code === ACTIONS.REGISTER_SURPLUS
    ? { before_stock: item.stock, before_kardex: item.kardex, after_stock: item.stock, after_kardex: fromUnits(toUnits(item.kardex) + toUnits(item.allowed_action.quantity)) }
    : { before_stock: null, before_kardex: null, after_stock: null, after_kardex: null };
  if (item.allowed_action.code === ACTIONS.REGISTER_SHORTAGE) {
    const snapshots = await loadLatestInventory(transfer, [registeredProduct.id], transaction);
    const current = snapshots.get(registeredProduct.id) || { stock: 0, kardex: 0 };
    inventory.before_stock = current.stock;
    inventory.before_kardex = current.kardex;
    inventory.after_stock = fromUnits(toUnits(current.stock) + toUnits(item.allowed_action.quantity));
    inventory.after_kardex = fromUnits(toUnits(current.kardex) + toUnits(item.allowed_action.quantity));
  }
  const previewFingerprint = fingerprint({ projection: projection.fingerprint, action: item.allowed_action, registered_product_id: registeredProduct.id, inventory });
  return {
    transfer,
    projection,
    item,
    requires_merma_product: false,
    preview: {
      fingerprint: previewFingerprint,
      action: item.allowed_action,
      product: registeredProduct,
      location: { id_sucursal: Number(transfer.id_sucursal_received), id_storage: Number(transfer.id_storage_received) },
      inventory,
      allocations: item.allowed_action.code === ACTIONS.REGISTER_SHORTAGE
        ? projection.items.filter(({ difference_type: type, difference_pending: pending }) => type === TYPES.SHORTAGE && Number(pending) > 0)
          .map(({ id, product, difference_pending: quantity }) => ({ id_detail_transfer: id, product, quantity }))
        : [{ id_detail_transfer: item.id, product: item.product, quantity: item.difference_pending }],
    },
  };
};

const previewCompletion = async (params) => {
  const result = await resolvePreviewAction(params);
  return result.preview || {
    fingerprint: result.projection.fingerprint,
    action: result.item.allowed_action,
    requires_merma_product: true,
    allocations: result.projection.items.filter(({ difference_type: type, difference_pending: pending }) => type === TYPES.SHORTAGE && Number(pending) > 0)
      .map(({ id, product, difference_pending: quantity }) => ({ id_detail_transfer: id, product, quantity })),
  };
};

const addMissingNoteDetails = async ({ note, allocations, actorUserId, productId, transaction }) => {
  const existing = await TransferReviewNoteDetail.findAll({ where: { id_transfer_review_note: note.id }, transaction, lock: transaction.LOCK.UPDATE });
  const existingIds = new Set(existing.map(({ id_detail_transfer: detailId }) => Number(detailId)));
  for (const allocation of allocations) {
    if (existingIds.has(Number(allocation.id_detail_transfer))) continue;
    const detail = await TransferReviewNoteDetail.create({
      id_transfer_review_note: note.id,
      id_detail_transfer: allocation.id_detail_transfer,
      id_product: allocation.product.id,
      quantity_sent: allocation.sent,
      quantity_received: allocation.received,
      quantity_difference: allocation.expected,
      reconciliation_status: 'EN_REVISION',
      quantity_resolved: 0,
    }, { transaction });
    await TransferReviewInventoryHold.create({
      quantity: allocation.expected,
      disposition: REVIEW_HOLD_DISPOSITIONS.IN_REVIEW,
      id_transfer_review_note_detail: detail.id,
      id_product: productId,
      id_sucursal: note.id_sucursal,
      id_storage: note.id_storage,
      id_created_user: actorUserId,
    }, { transaction });
  }
};

const findOrCreateReviewNote = async ({ transfer, type, productId, movement, allocations, reason, actorUserId, transaction }) => {
  let note = (transfer.reviewNotes || []).find((candidate) => candidate.management_status !== 'ELIMINADA'
    && candidate.type === type
    && Number(candidate.id_product) === Number(productId)
    && (type === 'FALTANTE_PARA_REVISION' || (candidate.details || []).some(({ id_detail_transfer: detailId }) => Number(detailId) === Number(allocations[0].id_detail_transfer))));
  if (!note) {
    note = await createTransferReviewNote({
      type,
      date: transfer.date_received || new Date(),
      observations: reason,
      transfer,
      kardexMovement: movement,
      productId,
      userId: actorUserId,
      storageId: transfer.id_storage_received,
      details: allocations.map((allocation) => ({
        id_detail_transfer: allocation.id_detail_transfer,
        id_product: allocation.product.id,
        quantity_sent: allocation.sent,
        quantity_received: allocation.received,
        quantity_difference: allocation.expected,
      })),
    }, transaction);
  } else {
    await addMissingNoteDetails({ note, allocations, actorUserId, productId, transaction });
  }
  return note;
};

const completeDifference = async ({ transferId, detailId, mermaProductId, previewFingerprint, reason, idempotencyKey, actorUserId }) => {
  if (!idempotencyKey) throw operationError('La clave de idempotencia es obligatoria.');
  const normalizedReason = String(reason || '').trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) throw operationError('El motivo debe tener entre 5 y 500 caracteres.');
  const existing = await TransferHistoricalDifferenceCompletion.findOne({ where: { idempotency_key: idempotencyKey } });
  if (existing) return { idempotent: true, completion: existing, projection: await getProjection(transferId) };
  return sequelize.transaction(async (transaction) => {
    await loadTransfer(transferId, { transaction, lock: true });
    const idempotentCompletion = await TransferHistoricalDifferenceCompletion.findOne({
      where: { idempotency_key: idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (idempotentCompletion) {
      return { idempotent: true, completion: idempotentCompletion, projection: await getProjection(transferId, { transaction }) };
    }
    const resolved = await resolvePreviewAction({ transferId, detailId, mermaProductId, transaction });
    if (!resolved.preview) throw operationError('Debe seleccionar el producto MERMAS antes de confirmar.');
    if (!previewFingerprint || previewFingerprint !== resolved.preview.fingerprint) {
      throw operationError('Los registros cambiaron desde la previsualización. Revise nuevamente la boleta.', 409);
    }
    const { transfer, item, preview } = resolved;
    const action = preview.action;
    let movement;
    if (action.code === ACTIONS.REGISTER_SURPLUS) {
      movement = await kardexMovements.create({
        type: 'INPUT', date: transfer.date_received || new Date(),
        details: `REGULARIZACION EXCEDENTE TRASPASO #${transfer.cod}`,
        quantity: action.quantity, cost: 0, price: 0, total: 0,
        id_product: preview.product.id, id_user: actorUserId,
        id_sucursal: transfer.id_sucursal_received, id_storage: transfer.id_storage_received,
        status: true, registry_number: transfer.registry_number,
      }, { transaction });
    } else {
      movement = await increaseStock({
        productId: preview.product.id,
        sucursalId: transfer.id_sucursal_received,
        storageId: transfer.id_storage_received,
        quantity: action.quantity,
        actorUserId,
        date: transfer.date_received || new Date(),
        details: `REGULARIZACION FALTANTE TRASPASO #${transfer.cod}`,
        registryNumber: transfer.registry_number,
        transaction,
      });
    }
    const allocationDetails = preview.allocations.map((allocation) => {
      const projected = resolved.projection.items.find(({ id }) => id === allocation.id_detail_transfer);
      return {
        id_detail_transfer: allocation.id_detail_transfer,
        product: allocation.product,
        sent: projected.sent,
        received: projected.received,
        expected: projected.difference_expected,
        quantity: allocation.quantity,
      };
    });
    const note = await findOrCreateReviewNote({
      transfer,
      type: action.code === ACTIONS.REGISTER_SURPLUS ? 'EXCEDENTE_PARA_REVISION' : 'FALTANTE_PARA_REVISION',
      productId: preview.product.id,
      movement,
      allocations: allocationDetails,
      reason: normalizedReason,
      actorUserId,
      transaction,
    });
    const completion = await TransferHistoricalDifferenceCompletion.create({
      idempotency_key: idempotencyKey,
      completion_type: action.code,
      quantity: action.quantity,
      allocations: allocationDetails.map(({ id_detail_transfer: allocationId, quantity }) => ({ id_detail_transfer: allocationId, quantity })),
      projection_fingerprint: preview.fingerprint,
      reason: normalizedReason,
      status: 'ACTIVE',
      id_transfer: transfer.id,
      id_detail_transfer: action.scope === 'ITEM' ? item.id : null,
      id_transfer_review_note: note.id,
      id_kardex_movement: movement.id,
      id_product: preview.product.id,
      id_user: actorUserId,
    }, { transaction });
    await TransferReviewEvent.create({
      event_type: 'REGISTRO_HISTORICO_COMPLETADO',
      description: action.code === ACTIONS.REGISTER_SURPLUS
        ? `Se completó el excedente histórico omitido de ${decimalToString(action.quantity)} kg en Kardex.`
        : `Se completó el faltante histórico omitido de ${decimalToString(action.quantity)} kg en el producto MERMAS.`,
      metadata: {
        completion_id: completion.id,
        completion_type: action.code,
        quantity: action.quantity,
        kardex_movement_id: movement.id,
        product_id: preview.product.id,
        inventory_effect: action.code === ACTIONS.REGISTER_SURPLUS ? 'KARDEX_ONLY' : 'STOCK_AND_KARDEX',
        reason: normalizedReason,
      },
      id_transfer_review_note: note.id,
      id_user: actorUserId,
    }, { transaction });
    await History.create({
      id_user: actorUserId,
      id_sucursal: transfer.id_sucursal_received,
      description: `${action.code} EN TRASLADO #${transfer.cod}: ${decimalToString(action.quantity)} KG`,
      type: 'REGULARIZACION HISTORICA DE TRASLADO',
      module: 'TRANSFER_REVIEW',
      action: 'CREATE',
      id_reference: transfer.id,
      status: true,
    }, { transaction });
    return { idempotent: false, completion, projection: await buildProjection(await loadTransfer(transfer.id, { transaction }), { transaction }) };
  });
};

module.exports = {
  expectedDifference,
  allocateCoveredQuantity,
  getProjection,
  previewCompletion,
  completeDifference,
};

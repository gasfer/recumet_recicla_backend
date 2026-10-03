'use strict';

const { exactCompare, exactAdd, exactSubtract, exactMax } = require('../helpers/number-formatter');
const EPSILON = 0;

const quantityString = (value) => exactAdd(value || 0, 0);
const approximatelyLess = (left, right) => exactCompare(left, right) < 0;

const productView = (product) => product ? {
  id: Number(product.id),
  cod: product.cod,
  name: product.name,
} : null;

const locationView = ({ sucursalId, storageId, sucursal, storage }) => ({
  id_sucursal: Number(sucursalId),
  id_storage: Number(storageId),
  sucursal: sucursal?.name || null,
  storage: storage?.name || null,
});

const movementView = (movement) => ({
  id: Number(movement.id),
  quantity: quantityString(movement.quantity),
  type: movement.type || null,
  registry_number: movement.registry_number || null,
  details: movement.details || null,
});

const actionView = (action) => ({
  id: Number(action.id),
  strategy: action.strategy || null,
  operation_type: action.operation_type || null,
  operation_id: action.operation_id ?? null,
  operation_status: action.operation_status || null,
  quantity: quantityString(action.quantity),
  movements: (action.movementLinks || [])
    .map(({ kardexMovement }) => kardexMovement)
    .filter(Boolean)
    .map(movementView),
});

const statusFor = ({ expectedQuantity, registeredQuantity, hasActiveRecord, ambiguous }) => {
  if (ambiguous) return 'EVIDENCIA_AMBIGUA';
  if (!hasActiveRecord && exactCompare(registeredQuantity, EPSILON) <= 0) return 'SIN_REGISTRO_ACTIVO';
  return approximatelyLess(registeredQuantity, expectedQuantity) ? 'REGISTRO_PARCIAL' : 'REGISTRO_EXISTENTE';
};

const messageFor = (status) => ({
  SIN_REGISTRO_ACTIVO: 'No existe un registro vigente para esta diferencia. Revise la previsualización antes de confirmar.',
  REGISTRO_EXISTENTE: 'Ya existe un registro vigente para esta diferencia. Se conserva sin crear otro movimiento.',
  REGISTRO_PARCIAL: 'Existe un registro parcial vigente. Se conserva y no se creará otro movimiento desde este formulario.',
  EVIDENCIA_AMBIGUA: 'Los registros encontrados no se pueden atribuir con certeza a esta diferencia. Requiere revisión manual.',
}[status]);

const inventoryProjection = ({ stock, kardex, quantity, differenceType }) => {
  if (stock === null || stock === undefined || kardex === null || kardex === undefined) return null;
  const beforeStock = exactAdd(stock, 0);
  const beforeKardex = exactAdd(kardex, 0);
  const registeredQuantity = exactAdd(quantity, 0);
  const shortage = differenceType === 'FALTANTE' || differenceType === 'FALTANTE_PARA_REVISION';
  return {
    before_stock: beforeStock,
    before_kardex: beforeKardex,
    after_stock: shortage ? exactAdd(beforeStock, registeredQuantity) : beforeStock,
    after_kardex: exactAdd(beforeKardex, registeredQuantity),
  };
};

const buildVerification = ({
  transfer, detail, differenceType, registeredProduct, location, expectedQuantity,
  registeredQuantity, pendingQuantity, noteNumber, actions = [], movements = [],
  ambiguous = false, inventory = null, noteWillBeAssigned = false,
}) => {
  const quantityRegistered = exactAdd(registeredQuantity || 0, 0);
  const quantityExpected = exactAdd(expectedQuantity || 0, 0);
  const status = statusFor({
    expectedQuantity: quantityExpected,
    registeredQuantity: quantityRegistered,
    hasActiveRecord: actions.length > 0 || movements.length > 0,
    ambiguous,
  });
  const inventoryView = inventory ? Object.fromEntries(Object.entries(inventory).map(([key, value]) => (
    value === null || value === undefined ? [key, value] : [key, quantityString(value)]
  ))) : null;
  return {
    status,
    is_blocked: status !== 'SIN_REGISTRO_ACTIVO',
    message: messageFor(status),
    transfer: {
      id: Number(transfer.id),
      number: transfer.cod || transfer.registry_number || null,
      registry_number: transfer.registry_number || null,
    },
    difference: {
      detail_id: Number(detail.id),
      type: differenceType,
      product: productView(detail.product),
      quantity_expected: quantityString(quantityExpected),
    },
    registration: {
      note_number: noteNumber || null,
      note_assigned_on_confirmation: !noteNumber && noteWillBeAssigned,
      product: productView(registeredProduct),
      location,
      quantity_registered: quantityString(quantityRegistered),
      quantity_pending: quantityString(exactMax(0, pendingQuantity === null || pendingQuantity === undefined
        ? exactSubtract(quantityExpected, quantityRegistered)
        : pendingQuantity)),
      actions: actions.map(actionView),
      movements: movements.map(movementView),
    },
    inventory: inventoryView,
  };
};

const buildAutomaticVerification = ({ context, actions, inventory }) => {
  const { note, detail, pending, registeredQuantity } = context;
  const registeredProduct = note.type === 'FALTANTE_PARA_REVISION' ? note.registeredProduct : detail.product;
  return buildVerification({
    transfer: note.transfer,
    detail,
    differenceType: note.type,
    registeredProduct,
    location: locationView({
      sucursalId: note.id_sucursal,
      storageId: note.id_storage,
      sucursal: note.transfer?.sucursal_received,
      storage: note.transfer?.storage_received,
    }),
    expectedQuantity: detail.quantity_difference,
    registeredQuantity,
    pendingQuantity: pending,
    noteNumber: note.registry_number,
    actions,
    inventory,
  });
};

const buildHistoricalVerification = ({ transfer, item, note, inventory }) => buildVerification({
  transfer,
  detail: item,
  differenceType: item.difference_type,
  registeredProduct: item.registered_product,
  location: locationView({
    sucursalId: transfer.id_sucursal_received,
    storageId: transfer.id_storage_received,
    sucursal: transfer.sucursal_received,
    storage: transfer.storage_received,
  }),
  expectedQuantity: item.difference_expected,
  registeredQuantity: item.difference_covered,
  pendingQuantity: item.difference_pending,
  noteNumber: note?.registry_number,
  movements: item.difference_movements || [],
  ambiguous: item.evidence_confidence === 'AMBIGUA',
  inventory,
  noteWillBeAssigned: true,
});

module.exports = {
  buildAutomaticVerification,
  buildHistoricalVerification,
  inventoryProjection,
};

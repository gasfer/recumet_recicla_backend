'use strict';

const PRICE_EDIT_GRACE_DAYS = 7;
const PURCHASE_EDIT_WINDOW_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const PROTECTED_INPUT_FIELDS = Object.freeze([
  'date_voucher', 'type', 'type_payment', 'type_registry', 'registry_number',
  'account_input', 'comments', 'discount', 'is_paid', 'id_scales', 'id_storage',
  'id_provider', 'id_bank', 'id_sucursal', 'referral_sources', 'old_customer',
  'with_pickup', 'number_transaction', 'status',
]);
const DERIVED_INPUT_FIELDS = new Set(['sumas', 'total']);
const NON_PRICE_DETAIL_FIELDS = ['quantity', 'status', 'expiration_date', 'profit_margin'];

const toPlain = value => value && typeof value.get === 'function'
  ? value.get({ plain: true })
  : (value || {});

const normalize = value => {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^-?\d+(\.\d+)?$/.test(String(value)) ? Number(value) : value;
};

const normalizeDate = value => {
  if (value === null || value === undefined || value === '') return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? String(value) : timestamp;
};

const valuesEqual = (field, before, after) => field === 'date_voucher'
  ? normalizeDate(before) === normalizeDate(after)
  : JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));

const elapsedDays = (date, now) => {
  const dateTime = new Date(date).getTime();
  const currentTime = new Date(now).getTime();
  if (!Number.isFinite(dateTime) || !Number.isFinite(currentTime) || dateTime > currentTime) return null;
  return (currentTime - dateTime) / DAY_IN_MS;
};

const detailsByProduct = details => {
  const result = new Map();
  for (const detail of details) {
    const productId = Number(detail.id_product);
    if (!Number.isInteger(productId) || result.has(productId)) return null;
    result.set(productId, detail);
  }
  return result;
};

const inspectChanges = ({ originalInput, requestedInput, originalDetails, requestedDetails }) => {
  const original = toPlain(originalInput);
  const requested = toPlain(requestedInput);
  const before = detailsByProduct(originalDetails.map(toPlain));
  const after = detailsByProduct(requestedDetails.map(toPlain));
  if (!before || !after || before.size !== after.size) {
    return { hasPriceChanges: false, hasNonPriceChanges: true, hasNonQuantityChanges: true };
  }

  let hasPriceChanges = false;
  let hasNonPriceChanges = false;
  let hasNonQuantityChanges = false;
  for (const [productId, detail] of after) {
    const previous = before.get(productId);
    if (!previous) {
      hasNonPriceChanges = true;
      hasNonQuantityChanges = true;
      continue;
    }
    if (detail.cost !== undefined && !valuesEqual('cost', previous.cost, detail.cost)) hasPriceChanges = true;
    if (NON_PRICE_DETAIL_FIELDS.some(field => detail[field] !== undefined && !valuesEqual(field, previous[field], detail[field]))) {
      hasNonPriceChanges = true;
      if (NON_PRICE_DETAIL_FIELDS.some(field => field !== 'quantity' && detail[field] !== undefined && !valuesEqual(field, previous[field], detail[field]))) {
        hasNonQuantityChanges = true;
      }
    }
  }

  for (const field of PROTECTED_INPUT_FIELDS) {
    if (requested[field] !== undefined && !valuesEqual(field, original[field], requested[field])) {
      hasNonPriceChanges = true;
      hasNonQuantityChanges = true;
    }
  }
  const originalAccount = toPlain(original.accounts_payable);
  if (requested.on_account !== undefined
    && !valuesEqual('on_account', originalAccount?.monto_abonado ?? 0, requested.on_account)) {
    hasNonPriceChanges = true;
    hasNonQuantityChanges = true;
  }

  return { hasPriceChanges, hasNonPriceChanges, hasNonQuantityChanges };
};

const classifyPurchaseEdit = ({
  originalInput,
  originalDetails = [],
  requestedInput = {},
  requestedDetails = [],
  actorRole,
  now = new Date(),
}) => {
  const original = toPlain(originalInput);
  const { hasPriceChanges, hasNonPriceChanges, hasNonQuantityChanges } = inspectChanges({
    originalInput, requestedInput, originalDetails, requestedDetails,
  });
  const isPriceOnly = hasPriceChanges && !hasNonPriceChanges;
  const createdAge = elapsedDays(original.createdAt, now);
  const editAge = elapsedDays(original.date_voucher, now);
  const editWindowExpired = editAge === null || editAge > PURCHASE_EDIT_WINDOW_DAYS;
  const isAdmin = actorRole === 'ADMINISTRADOR';
  const isWeighingOperator = actorRole === 'OPERADOR_BALANZA';
  const withinCajaGrace = actorRole === 'LIQUIDACION_CAJA'
    && createdAge !== null && createdAge <= PRICE_EDIT_GRACE_DAYS;

  return {
    hasPriceChanges,
    hasNonPriceChanges,
    isPriceOnly,
    editWindowExpired,
    forbiddenPriceChange: isWeighingOperator && hasPriceChanges,
    forbiddenPurchaseChange: isWeighingOperator && hasNonQuantityChanges,
    requiresAuthorization: hasPriceChanges && !isAdmin && !withinCajaGrace && !isWeighingOperator,
    reason: !hasPriceChanges ? 'no-price-change'
      : isAdmin ? 'administrator-price-edit'
      : isWeighingOperator ? 'weighing-role-price-edit-forbidden'
      : withinCajaGrace ? 'liquidation-price-edit-within-seven-days'
      : createdAge === null ? 'invalid-pricing-age'
      : createdAge > PRICE_EDIT_GRACE_DAYS ? 'pricing-window-expired'
      : 'role-requires-price-authorization',
  };
};

module.exports = {
  PRICE_EDIT_GRACE_DAYS,
  PURCHASE_EDIT_WINDOW_DAYS,
  PROTECTED_INPUT_FIELDS,
  classifyPurchaseEdit,
  inspectChanges,
};

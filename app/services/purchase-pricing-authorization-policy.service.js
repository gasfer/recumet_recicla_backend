'use strict';

const INITIAL_PRICING_GRACE_HOURS = 24;
const HOUR_IN_MS = 60 * 60 * 1000;

const PROTECTED_INPUT_FIELDS = Object.freeze([
  'date_voucher',
  'type',
  'type_payment',
  'type_registry',
  'registry_number',
  'account_input',
  'comments',
  'discount',
  'is_paid',
  'id_scales',
  'id_storage',
  'id_provider',
  'id_bank',
  'id_sucursal',
  'referral_sources',
  'old_customer',
  'with_pickup',
  'number_transaction',
  'status',
]);

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

const valuesEqual = (field, before, after) => {
  if (field === 'date_voucher') return normalizeDate(before) === normalizeDate(after);
  return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
};

const isUnpriced = value => {
  if (value === null || value === undefined || value === '') return true;
  const amount = Number(value);
  return Number.isFinite(amount) && amount === 0;
};

const isPositiveAmount = value => Number.isFinite(Number(value)) && Number(value) > 0;
const nearlyEqual = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.0001;

const pricingWindowReason = (createdAt, now) => {
  const createdAtTime = new Date(createdAt).getTime();
  const currentTime = new Date(now).getTime();
  if (!Number.isFinite(createdAtTime) || !Number.isFinite(currentTime)) return 'invalid-pricing-window';
  const elapsed = currentTime - createdAtTime;
  if (elapsed < 0) return 'future-created-at';
  return elapsed <= INITIAL_PRICING_GRACE_HOURS * HOUR_IN_MS ? null : 'pricing-window-expired';
};

const hasProtectedInputChanges = (originalInput, requestedInput) => {
  const original = toPlain(originalInput);
  const requested = toPlain(requestedInput);
  return PROTECTED_INPUT_FIELDS.some(field => (
    requested[field] !== undefined && !valuesEqual(field, original[field], requested[field])
  ));
};

const hasChangedInitialPayment = (originalInput, requestedInput) => {
  const requested = toPlain(requestedInput);
  if (requested.on_account === undefined) return false;
  const original = toPlain(originalInput);
  const account = toPlain(original.accounts_payable);
  return !valuesEqual('on_account', account.monto_abonado ?? 0, requested.on_account);
};

const classifyInitialPricing = ({
  originalInput,
  originalDetails = [],
  requestedInput = {},
  requestedDetails = [],
  now = new Date(),
}) => {
  const before = originalDetails.map(toPlain);
  const after = requestedDetails.map(toPlain);

  if (!before.length) return { requiresAuthorization: true, reason: 'missing-original-details' };
  if (!before.some(detail => isUnpriced(detail.cost))) {
    return { requiresAuthorization: true, reason: 'previously-priced' };
  }
  const windowReason = pricingWindowReason(toPlain(originalInput).createdAt, now);
  if (windowReason) return { requiresAuthorization: true, reason: windowReason };
  if (before.length !== after.length) {
    return { requiresAuthorization: true, reason: 'details-changed' };
  }
  if (hasProtectedInputChanges(originalInput, requestedInput) || hasChangedInitialPayment(originalInput, requestedInput)) {
    return { requiresAuthorization: true, reason: 'purchase-data-changed' };
  }

  const beforeByProduct = new Map(before.map(detail => [Number(detail.id_product), detail]));
  const requestedProductIds = after.map(detail => Number(detail.id_product));
  if (beforeByProduct.size !== before.length || new Set(requestedProductIds).size !== after.length) {
    return { requiresAuthorization: true, reason: 'ambiguous-products' };
  }

  let derivedSum = 0;
  let completedPrices = 0;
  for (const requestedDetail of after) {
    const originalDetail = beforeByProduct.get(Number(requestedDetail.id_product));
    const quantity = Number(requestedDetail.quantity);
    const cost = Number(requestedDetail.cost);
    const total = Number(requestedDetail.total);
    if (!originalDetail
      || !valuesEqual('quantity', originalDetail.quantity, requestedDetail.quantity)
      || !Number.isFinite(quantity)
      || !Number.isFinite(cost)
      || !Number.isFinite(total)
      || !nearlyEqual(total, quantity * cost)) {
      return { requiresAuthorization: true, reason: 'non-pricing-detail-change' };
    }
    if (isUnpriced(originalDetail.cost)) {
      if (!isUnpriced(requestedDetail.cost) && !isPositiveAmount(requestedDetail.cost)) {
        return { requiresAuthorization: true, reason: 'non-pricing-detail-change' };
      }
      if (isPositiveAmount(requestedDetail.cost)) completedPrices += 1;
    } else if (!valuesEqual('cost', originalDetail.cost, requestedDetail.cost)) {
      return { requiresAuthorization: true, reason: 'previous-price-changed' };
    }
    derivedSum += total;
  }

  if (!completedPrices) return { requiresAuthorization: true, reason: 'no-pending-price-completed' };

  const requested = toPlain(requestedInput);
  if (requested.sumas !== undefined && !nearlyEqual(requested.sumas, derivedSum)) {
    return { requiresAuthorization: true, reason: 'invalid-derived-totals' };
  }
  const discount = Number(toPlain(originalInput).discount || 0);
  if (requested.total !== undefined && !nearlyEqual(requested.total, derivedSum - discount)) {
    return { requiresAuthorization: true, reason: 'invalid-derived-totals' };
  }

  return { requiresAuthorization: false, reason: 'initial-pricing' };
};

module.exports = {
  INITIAL_PRICING_GRACE_HOURS,
  PROTECTED_INPUT_FIELDS,
  classifyInitialPricing,
  isUnpriced,
  pricingWindowReason,
};

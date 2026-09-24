'use strict';

const TOLERANCE_DECISIONS = Object.freeze({
  ACCEPTED: 'ACEPTADO',
  REQUIRES_REVIEW: 'REQUIERE_CONCILIACION',
  UNDETERMINED: 'NO_EVALUABLE',
});

const ACCOUNTING_STATUSES = Object.freeze({
  ACCOUNTED: 'CONTABILIZADO',
  REVERSED: 'REVERTIDO',
  LEGACY_PENDING: 'PENDIENTE_CONCILIACION',
});

const TOLERANCE_ALIASES = Object.freeze({
  ACCEPTED: TOLERANCE_DECISIONS.ACCEPTED,
  REQUIRES_REVIEW: TOLERANCE_DECISIONS.REQUIRES_REVIEW,
  UNDETERMINED: TOLERANCE_DECISIONS.UNDETERMINED,
});

const ACCOUNTING_ALIASES = Object.freeze({
  ACCOUNTED: ACCOUNTING_STATUSES.ACCOUNTED,
  PENDING: ACCOUNTING_STATUSES.LEGACY_PENDING,
  REVERSED: ACCOUNTING_STATUSES.REVERSED,
});

const normalizeToleranceDecision = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toUpperCase();
  return TOLERANCE_ALIASES[normalized] || normalized;
};

const normalizeAccountingStatus = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().toUpperCase();
  return ACCOUNTING_ALIASES[normalized] || normalized;
};

const isAcceptedToleranceDecision = (value) => (
  normalizeToleranceDecision(value) === TOLERANCE_DECISIONS.ACCEPTED
);

const requiresToleranceReview = (value) => {
  const normalized = normalizeToleranceDecision(value);
  return normalized === TOLERANCE_DECISIONS.REQUIRES_REVIEW
    || normalized === TOLERANCE_DECISIONS.UNDETERMINED;
};

module.exports = {
  ACCOUNTING_STATUSES,
  TOLERANCE_DECISIONS,
  normalizeAccountingStatus,
  normalizeToleranceDecision,
  isAcceptedToleranceDecision,
  requiresToleranceReview,
};

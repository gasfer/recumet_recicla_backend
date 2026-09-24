'use strict';

const {
  ACCOUNTING_STATUSES,
  TOLERANCE_DECISIONS,
} = require('../constants/transfer-reception-accounting');

const roundPercentage = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

const evaluateReceiptTolerance = (sentQuantity, receivedQuantity) => {
  const sent = Number(sentQuantity);
  const received = Number(receivedQuantity);
  if (!Number.isFinite(sent) || !Number.isFinite(received)) {
    throw new TypeError('Las cantidades enviada y recibida deben ser números finitos.');
  }
  if (sent === 0) {
    return {
      decision: TOLERANCE_DECISIONS.UNDETERMINED,
      accountingStatus: ACCOUNTING_STATUSES.ACCOUNTED,
      differencePercentage: null,
    };
  }

  const differencePercentage = roundPercentage(((received - sent) / sent) * 100);
  const accepted = differencePercentage >= -1 && differencePercentage <= 1;
  return {
    decision: accepted ? TOLERANCE_DECISIONS.ACCEPTED : TOLERANCE_DECISIONS.REQUIRES_REVIEW,
    accountingStatus: ACCOUNTING_STATUSES.ACCOUNTED,
    differencePercentage,
  };
};

module.exports = { ACCOUNTING_STATUSES, TOLERANCE_DECISIONS, evaluateReceiptTolerance };

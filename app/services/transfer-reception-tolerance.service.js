'use strict';

const {
  ACCOUNTING_STATUSES,
  TOLERANCE_DECISIONS,
} = require('../constants/transfer-reception-accounting');
const { exactAdd, exactSubtract, exactCompare, exactAbs, exactMultiply, exactDivide } = require('../helpers/number-formatter');

const evaluateReceiptTolerance = (sentQuantity, receivedQuantity) => {
  const sent = exactAdd(sentQuantity, 0);
  const received = exactAdd(receivedQuantity, 0);
  if (exactCompare(sent, 0) === 0) {
    return {
      decision: TOLERANCE_DECISIONS.UNDETERMINED,
      accountingStatus: ACCOUNTING_STATUSES.ACCOUNTED,
      differencePercentage: null,
    };
  }

  const delta = exactSubtract(received, sent);
  const differencePercentage = Number(exactDivide(exactMultiply(delta, 100), sent, 4));
  const accepted = exactCompare(exactMultiply(exactAbs(delta), 100), exactAbs(sent)) <= 0;
  return {
    decision: accepted ? TOLERANCE_DECISIONS.ACCEPTED : TOLERANCE_DECISIONS.REQUIRES_REVIEW,
    accountingStatus: ACCOUNTING_STATUSES.ACCOUNTED,
    differencePercentage,
  };
};

module.exports = { ACCOUNTING_STATUSES, TOLERANCE_DECISIONS, evaluateReceiptTolerance };

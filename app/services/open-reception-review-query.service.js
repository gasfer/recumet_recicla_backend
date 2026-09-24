'use strict';

const { isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');

const { Op } = require('sequelize');
const { REVIEW_STATUSES } = require('../constants/transfer-review');

const buildOpenReviewWhere = (extra = {}) => ({
  [Op.or]: [
    { reconciliation_status: { [Op.ne]: REVIEW_STATUSES.COMPLETED } },
    { resolved_at: null },
  ],
  management_status: { [Op.ne]: 'ELIMINADA' },
  ...extra,
});

const isOpenReview = (review) => (
  review?.management_status !== 'ELIMINADA'
  && (review?.reconciliation_status !== REVIEW_STATUSES.COMPLETED || !review?.resolved_at)
);

const isInconclusiveMode = (value) => value === true || value === 'true';

const hasExplicitDateRange = ({ filterBy, date1, date2 } = {}) => (
  filterBy === 'RANGE' && Boolean(date1) && Boolean(date2)
);

const shouldApplyTransferDateFilter = (filters = {}) => (
  !isInconclusiveMode(filters.inconclusive) || hasExplicitDateRange(filters)
);

const mapOpenReviewNote = (note) => {
  const plain = typeof note?.toJSON === 'function' ? note.toJSON() : note;
  const rawDetails = Array.isArray(plain?.details) ? plain.details : [];
  const details = rawDetails.filter((detail) => !isAcceptedToleranceDecision(detail.transferDetail?.tolerance_decision));
  return {
    ...plain,
    pending_items: details.filter((detail) => detail.reconciliation_status !== REVIEW_STATUSES.COMPLETED).length,
    details: details.map((detail) => ({
      ...detail,
      quantity_remaining: Math.max(
        0,
        Number(detail.quantity_difference || 0) - Number(detail.quantity_resolved || 0),
      ),
    })),
  };
};

module.exports = {
  buildOpenReviewWhere,
  isOpenReview,
  isInconclusiveMode,
  hasExplicitDateRange,
  shouldApplyTransferDateFilter,
  mapOpenReviewNote,
};

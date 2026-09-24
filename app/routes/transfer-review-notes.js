const { Router } = require('express');
const { validarJWT } = require('../middlewares/validators/validar-jwt');
const {
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
  printReviewNote,
  getManagedReconciliations,
  getReceptionDifferences,
  reverseReconciliation,
  deleteReconciliation,
  previewAutomaticResolution,
  confirmAutomaticResolution,
  previewHistoricalDifferenceCompletion,
  completeHistoricalDifference,
  previewBulkReconciliation,
  confirmBulkReconciliation,
} = require('../controllers/transfer_review_notes.controller');
const { authorizeTransferReview } = require('../middlewares/authorize-transfer-review');

const router = Router();
router.get('/open', [validarJWT, authorizeTransferReview('read')], getOpenReviews);
router.get('/management', [validarJWT, authorizeTransferReview('read')], getManagedReconciliations);
router.get('/reception-differences', [validarJWT, authorizeTransferReview('read')], getReceptionDifferences);
router.get('/assignees', [validarJWT, authorizeTransferReview('read')], getAssignableUsers);
router.get('/report', [validarJWT, authorizeTransferReview('read')], getReviewReport);
router.get('/stock-diagnostic', [validarJWT, authorizeTransferReview('read')], getReviewStockDiagnostic);
router.get('/retained-without-adjustment', [validarJWT, authorizeTransferReview('read')], getRetainedWithoutAdjustment);
router.get('/transfer/:id_transfer/traceability', [validarJWT, authorizeTransferReview('read')], getTraceability);
router.get('/transfer/:id_transfer/details/:detail_id/historical-completion-preview', [validarJWT, authorizeTransferReview('read')], previewHistoricalDifferenceCompletion);
router.post('/transfer/:id_transfer/details/:detail_id/historical-completion', [validarJWT, authorizeTransferReview('resolve')], completeHistoricalDifference);
router.put('/:id/assign', [validarJWT, authorizeTransferReview('assign')], assignReview);
router.post('/:id/comments', [validarJWT, authorizeTransferReview('read')], addComment);
router.post('/:id/actions', [validarJWT, authorizeTransferReview('resolve')], addManualAction);
router.post('/:id/evidences', [validarJWT, authorizeTransferReview('resolve')], addEvidence);
router.put('/:id/close', [validarJWT, authorizeTransferReview('approve')], closeReview);
router.put('/:id/reopen', [validarJWT, authorizeTransferReview('reopen')], reopenReview);
router.put('/:id/reverse', [validarJWT, authorizeTransferReview('reopen')], reverseReconciliation);
router.delete('/:id', [validarJWT, authorizeTransferReview('reopen')], deleteReconciliation);
router.post('/:id/details/:detail_id/documentary-close', [validarJWT, authorizeTransferReview('resolve')], documentaryCloseReviewDetail);
router.get('/:id/details/:detail_id/automatic-preview', [validarJWT, authorizeTransferReview('resolve')], previewAutomaticResolution);
router.post('/:id/details/:detail_id/automatic-resolve', [validarJWT, authorizeTransferReview('resolve')], confirmAutomaticResolution);
router.post('/:id/bulk-preview', [validarJWT, authorizeTransferReview('resolve')], previewBulkReconciliation);
router.post('/:id/bulk-resolve', [validarJWT, authorizeTransferReview('resolve')], confirmBulkReconciliation);
router.post('/:id/details/:detail_id/resolve', [validarJWT, authorizeTransferReview('approve')], resolveReviewDetail);
router.get('/:id/pdf', [validarJWT, authorizeTransferReview('read')], printReviewNote);
router.get('/:id', [validarJWT, authorizeTransferReview('read')], getReviewNote);

module.exports = router;

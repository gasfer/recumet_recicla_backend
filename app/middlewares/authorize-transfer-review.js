'use strict';

const {
  REVIEW_PERMISSION_ACTIONS,
  REVIEW_PERMISSION_MODULE,
} = require('../constants/transfer-review');

const authorizeTransferReview = (action) => (req, res, next) => {
  if (req.userAuth?.role === 'ADMINISTRADOR') return next();

  const permissionField = REVIEW_PERMISSION_ACTIONS[action];
  const permission = (req.userAuth?.assign_permission || []).find(({ module, status }) => (
    module === REVIEW_PERMISSION_MODULE && status !== false
  ));
  if (!permissionField || permission?.[permissionField] !== true) {
    return res.status(403).json({
      ok: false,
      errors: [{ msg: `No tienes permiso para ${action} revisiones de traslados.` }],
    });
  }
  return next();
};

module.exports = { authorizeTransferReview };

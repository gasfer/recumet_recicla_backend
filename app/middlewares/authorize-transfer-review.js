'use strict';

const {
  REVIEW_PERMISSION_ACTIONS,
  REVIEW_PERMISSION_MODULE,
} = require('../constants/transfer-review');
const { actionLabel, sendPermissionDenied } = require('../helpers/permission-denied');
const { readPermissionField, isPermissionActionGranted } = require('../helpers/permission-fields');

const authorizeTransferReview = (action) => (req, res, next) => {
  if (req.userAuth?.role === 'ADMINISTRADOR') return next();

  const permissionField = REVIEW_PERMISSION_ACTIONS[action];
  const permission = (req.userAuth?.assign_permission || []).find((item) => (
    readPermissionField(item, 'module') === REVIEW_PERMISSION_MODULE
    && readPermissionField(item, 'status') !== false
  ));
  if (!permissionField || !isPermissionActionGranted(permission, permissionField)) {
    return sendPermissionDenied(res, `${actionLabel(action)} revisiones de traslados`);
  }
  return next();
};

module.exports = { authorizeTransferReview };

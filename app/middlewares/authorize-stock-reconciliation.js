'use strict';

const {
  STOCK_RECONCILIATION_MODULE,
  STOCK_RECONCILIATION_PERMISSION_ACTIONS,
} = require('../constants/stock-reconciliation');
const { readPermissionField, isPermissionActionGranted } = require('../helpers/permission-fields');
const { actionLabel, sendPermissionDenied } = require('../helpers/permission-denied');

const authorizeStockReconciliation = (action) => (req, res, next) => {
  if (req.userAuth?.role === 'ADMINISTRADOR') return next();
  const permissionField = STOCK_RECONCILIATION_PERMISSION_ACTIONS[action];
  const permission = (req.userAuth?.assign_permission || []).find((item) => (
    readPermissionField(item, 'module') === STOCK_RECONCILIATION_MODULE
    && readPermissionField(item, 'status') !== false
  ));
  if (!permissionField || !isPermissionActionGranted(permission, permissionField)) {
    return sendPermissionDenied(res, `${actionLabel(action)} conciliaciones Stock–Kardex`);
  }
  const requestedSucursal = Number(req.query?.id_sucursal || req.body?.id_sucursal);
  if (requestedSucursal) {
    const assigned = (req.userAuth?.assign_sucursales || []).some(({ id_sucursal, status }) => (
      status !== false && Number(id_sucursal) === requestedSucursal
    ));
    if (!assigned) return sendPermissionDenied(res, 'acceder a conciliaciones Stock–Kardex de esta sucursal');
  }
  return next();
};

module.exports = { authorizeStockReconciliation };

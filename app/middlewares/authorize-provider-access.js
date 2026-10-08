'use strict';
const { authorizeModulePermission } = require('./authorize-module-permission');
const { readPermissionField, isPermissionActionGranted } = require('../helpers/permission-fields');

function authorizeProviderAccess(action) {
  const management = authorizeModulePermission('PROVEEDORES', action);
  const middleware = (req, res, next) => {
    if (['view', 'create'].includes(action)) {
      const listPermission = (req.userAuth?.assign_permission || []).find(permission => (
        readPermissionField(permission, 'module') === 'LISTA PROVEEDORES'
        && readPermissionField(permission, 'status') !== false
      ));
      if (isPermissionActionGranted(listPermission, action)) return next();
    }
    return management(req, res, next);
  };
  middleware.modulePermission = management.modulePermission;
  return middleware;
}

module.exports = { authorizeProviderAccess };

'use strict';

const { sendPermissionDenied } = require('../helpers/permission-denied');

function authorizeCommercialProviderClassification(req, res, next) {
  if (['COMERCIAL', 'ADMINISTRADOR'].includes(req.userAuth?.role)) return next();
  return sendPermissionDenied(res, 'asignar o modificar la clasificación comercial del proveedor');
}

module.exports = { authorizeCommercialProviderClassification };

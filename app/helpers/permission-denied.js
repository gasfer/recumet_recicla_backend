'use strict';

const SUPPORT_GUIDANCE = 'Comuníquese con soporte para solicitar la habilitación.';

const ACTION_LABELS = Object.freeze({
  view: 'ver',
  create: 'crear',
  update: 'modificar',
  delete: 'eliminar',
  reports: 'generar reportes de',
  read: 'consultar',
  assign: 'asignar',
  resolve: 'resolver',
  reopen: 'reabrir',
  approve: 'aprobar',
});

const actionLabel = action => ACTION_LABELS[action] || 'realizar esta acción en';

const permissionDeniedMessage = (context = 'realizar esta acción') => (
  `No tiene permiso para ${context}. ${SUPPORT_GUIDANCE}`
);

const sendPermissionDenied = (res, context, details = {}) => res.status(403).json({
  ok: false,
  errors: [{ msg: permissionDeniedMessage(context), ...details }],
});

const permissionDeniedError = context => Object.assign(
  new Error(permissionDeniedMessage(context)),
  { statusCode: 403 },
);

module.exports = {
  SUPPORT_GUIDANCE,
  actionLabel,
  permissionDeniedMessage,
  sendPermissionDenied,
  permissionDeniedError,
};

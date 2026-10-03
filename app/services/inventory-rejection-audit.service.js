'use strict';

const { randomUUID } = require('node:crypto');
const { History } = require('../database/config');

const rejectionCodes = new Set(['STOCK_KARDEX_PARITY_VIOLATION', 'KARDEX_PROJECTION_UNAVAILABLE', 'INVENTORY_POSTING_REJECTED', 'REVIEW_CLOSURE_REJECTED']);
const recordInventoryRejection = async (error, actor) => {
  if (!rejectionCodes.has(error.code)) return error;
  const correlationId = randomUUID();
  // This is called only after the caller's operational transaction rolled back.
  await History.create({
    id_user: actor?.id, module: 'INVENTORY', type: 'INTEGRITY_REJECTED', action: 'REJECT',
    description: `Operación rechazada: ${error.code} · ${correlationId}`,
    query: JSON.stringify({ correlationId, code: error.code, details: error.details, attemptedAt: new Date().toISOString() }), status: true,
  });
  const allowed = new Set((actor?.assign_sucursales || []).filter(({ status }) => status !== false).map(({ id_sucursal }) => Number(id_sucursal)));
  const details = Array.isArray(error.details) ? error.details.filter(({ sucursal_id }) => actor?.role === 'ADMINISTRADOR' || allowed.has(Number(sucursal_id))) : undefined;
  return Object.assign(new Error(error.message), { statusCode: error.statusCode, code: error.code, correlationId, details });
};

module.exports = { recordInventoryRejection };

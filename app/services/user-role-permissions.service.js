'use strict';

const { assignPermission } = require('../database/config');
const PROVIDER_REGISTRATION_ROLES = ['OPERADOR_BALANZA', 'LIQUIDACION_CAJA'];

async function ensureProviderRegistrationPermission(user, transaction) {
  if (!PROVIDER_REGISTRATION_ROLES.includes(user.role)) return;
  const existing = await assignPermission.findOne({
    where: { id_user: user.id, module: 'LISTA PROVEEDORES' }, transaction,
  });
  if (existing) return;
  await assignPermission.create({
    id_user: user.id, module: 'LISTA PROVEEDORES', view: true, create: true,
    update: false, delete: false, reports: false, status: true,
  }, { transaction });
}

module.exports = { ensureProviderRegistrationPermission, PROVIDER_REGISTRATION_ROLES };

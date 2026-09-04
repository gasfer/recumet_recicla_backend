'use strict';
const { Op } = require('sequelize');
const { User } = require('../database/config');
const roles = ['ADMINISTRADOR', 'ENCARGADO'];
const validationError = message => Object.assign(new Error(message), {
  status: 422,
  code: 'PURCHASE_EDIT_AUTHORIZATION_REQUIRED',
});

const listAuthorizers = () => User.findAll({
  where: { status: true, role: { [Op.in]: roles } },
  attributes: ['id', 'full_names', 'role'], order: [['full_names', 'ASC']],
});

const resolveAuthorizer = async (id, transaction) => {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    throw validationError('Seleccione al responsable que autoriza la edición de la compra.');
  }
  const user = await User.findByPk(Number(id), {
    attributes: ['id', 'full_names', 'role', 'status'], transaction,
    lock: transaction.LOCK.SHARE,
  });
  if (!user || user.status !== true || !roles.includes(user.role)) {
    throw validationError('El responsable debe ser un Administrador o Encargado activo. Actualice la lista y seleccione otro usuario.');
  }
  return user;
};
module.exports = { listAuthorizers, resolveAuthorizer };

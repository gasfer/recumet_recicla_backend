'use strict';

const { Sucursal, Storage } = require('../database/config');

const locationError = (status, message) => Object.assign(new Error(message), { status });

const assertAssignedBranch = (user, branchId) => {
  const normalizedBranchId = Number(branchId);
  if (!Number.isInteger(normalizedBranchId) || normalizedBranchId <= 0) {
    throw locationError(422, 'Seleccione una sucursal válida para la compra.');
  }
  if (user?.role === 'ADMINISTRADOR') return;
  const assigned = (user?.assign_sucursales || []).some((item) => (
    item.status !== false && Number(item.id_sucursal) === normalizedBranchId
  ));
  if (!assigned) throw locationError(403, 'No tiene acceso a la sucursal seleccionada para registrar compras.');
};

const assertWarehouseInBranch = (storage, branchId) => {
  if (!storage || Number(storage.id_sucursal) !== Number(branchId)) {
    throw locationError(422, 'El almacén seleccionado no pertenece a la sucursal de la compra.');
  }
};

const validatePurchaseLocation = async ({ user, branchId, storageId, transaction }) => {
  assertAssignedBranch(user, branchId);
  const options = transaction ? { transaction, lock: transaction.LOCK.SHARE } : {};
  const [branch, storage] = await Promise.all([
    Sucursal.findByPk(Number(branchId), { ...options, attributes: ['id', 'status'] }),
    Storage.findByPk(Number(storageId), { ...options, attributes: ['id', 'id_sucursal', 'status'] }),
  ]);
  if (!branch || branch.status !== true) throw locationError(422, 'La sucursal seleccionada no existe o está inactiva.');
  if (!storage || storage.status !== true) throw locationError(422, 'El almacén seleccionado no existe o está inactivo.');
  assertWarehouseInBranch(storage, branch.id);
  return { branch, storage };
};

module.exports = { assertAssignedBranch, assertWarehouseInBranch, validatePurchaseLocation };

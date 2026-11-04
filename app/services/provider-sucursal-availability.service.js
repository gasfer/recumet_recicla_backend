'use strict';

const { Op } = require('sequelize');
const { Provider, ProviderSucursalAvailability, Sucursal } = require('../database/config');

const uniqueIds = values => [...new Set((Array.isArray(values) ? values : [])
  .map(Number).filter(value => Number.isSafeInteger(value) && value > 0))];

class ProviderSucursalAvailabilityService {
  assignedBranchIds(user) {
    if (user?.role === 'ADMINISTRADOR') return null;
    return uniqueIds((user?.assign_sucursales || [])
      .filter(assignment => assignment.status !== false)
      .map(assignment => assignment.id_sucursal));
  }

  async assertBranchAccess(branchId, user, transaction) {
    const idSucursal = Number(branchId);
    if (!Number.isSafeInteger(idSucursal) || idSucursal < 1) {
      throw this.error('Seleccione una sucursal válida', 400);
    }
    const sucursal = await Sucursal.findByPk(idSucursal, { transaction });
    if (!sucursal?.status) throw this.error('La sucursal seleccionada no existe o está inactiva', 400);
    const assigned = this.assignedBranchIds(user);
    if (assigned && !assigned.includes(idSucursal)) throw this.error('No tiene acceso a la sucursal seleccionada', 403);
    return idSucursal;
  }

  async enableInitial(providerId, branchId, user, transaction) {
    const idSucursal = await this.assertBranchAccess(branchId, user, transaction);
    const association = await ProviderSucursalAvailability.findOne({
      where: { id_provider: providerId, id_sucursal: idSucursal }, transaction,
    });
    if (association) {
      if (!association.status) await association.update({ status: true }, { transaction });
      return association;
    }
    return ProviderSucursalAvailability.create({ id_provider: providerId, id_sucursal: idSucursal, status: true }, { transaction });
  }

  async syncAuthorized(providerId, branchIds, user, transaction) {
    const requested = uniqueIds(branchIds);
    const assigned = this.assignedBranchIds(user);
    const [allowedBranches, existing] = await Promise.all([
      Sucursal.findAll({
        where: { status: true, ...(assigned ? { id: { [Op.in]: assigned } } : {}) },
        attributes: ['id'], transaction,
      }),
      ProviderSucursalAvailability.findAll({ where: { id_provider: providerId }, transaction }),
    ]);
    const allowed = allowedBranches.map(branch => Number(branch.id));
    if (!allowed.length) throw this.error('No tiene sucursales autorizadas para administrar proveedores', 403);
    const byBranch = new Map(existing.map(row => [Number(row.id_sucursal), row]));
    const unauthorizedRequested = requested.filter(branchId => !allowed.includes(branchId)
      && !byBranch.get(branchId)?.status);
    if (unauthorizedRequested.length) {
      throw this.error('No tiene permiso para habilitar disponibilidad en una o más sucursales', 403);
    }
    const invalidRequested = requested.filter(branchId => !allowed.includes(branchId) && !byBranch.has(branchId));
    if (invalidRequested.length) throw this.error('Una o más sucursales no existen o están inactivas', 400);
    for (const branchId of allowed) {
      const shouldEnable = requested.includes(Number(branchId));
      const association = byBranch.get(Number(branchId));
      if (association) {
        if (Boolean(association.status) !== shouldEnable) await association.update({ status: shouldEnable }, { transaction });
      } else if (shouldEnable) {
        await ProviderSucursalAvailability.create({ id_provider: providerId, id_sucursal: branchId, status: true }, { transaction });
      }
    }
  }

  async enabledBranchIds(providerId, transaction) {
    const rows = await ProviderSucursalAvailability.findAll({
      where: { id_provider: providerId, status: true },
      attributes: ['id_sucursal'], order: [['id_sucursal', 'ASC']], raw: true, transaction,
    });
    return rows.map(row => Number(row.id_sucursal));
  }

  async isEnabled(providerId, branchId, transaction) {
    if (!providerId || !branchId) return false;
    return Boolean(await ProviderSucursalAvailability.findOne({
      where: { id_provider: Number(providerId), id_sucursal: Number(branchId), status: true },
      attributes: ['id'], raw: true, transaction,
    }));
  }

  async findAvailableProviders(query, branchId, user) {
    const idSucursal = await this.assertBranchAccess(branchId, user);
    const where = { status: true };
    if (query) where[Op.or] = [
      { full_names: { [Op.iLike]: `%${query}%` } },
      { number_document: { [Op.iLike]: `%${query}%` } },
    ];
    const associations = await ProviderSucursalAvailability.findAll({
      where: { id_sucursal: idSucursal, status: true }, attributes: ['id_provider'], raw: true,
    });
    const providerIds = associations.map(row => Number(row.id_provider));
    if (!providerIds.length) return [];
    return Provider.findAll({
      attributes: ['id', 'full_names', 'number_document', 'estado_registro'],
      where: { ...where, id: { [Op.in]: providerIds } },
      include: [{ association: 'type', attributes: ['code'] }], limit: 20,
      order: [['full_names', 'ASC'], ['id', 'ASC']],
    });
  }

  error(message, statusCode) {
    return Object.assign(new Error(message), { statusCode });
  }
}

module.exports = new ProviderSucursalAvailabilityService();

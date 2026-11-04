'use strict';
const db = require('../database/config');
const { Op, QueryTypes } = require('sequelize');
const { normalizeQuery, buildQuery } = require('./provider-management-query');

function assignedBranches(user) {
  if (user?.role === 'ADMINISTRADOR') return null;
  return [...new Set((user?.assign_sucursales || []).filter(item => item.status !== false).map(item => Number(item.id_sucursal)).filter(Number.isInteger))];
}

async function normalizeScopedQuery(raw, user) {
  const q = normalizeQuery(raw);
  const branches = assignedBranches(user);
  if (q.entity_type) {
    const type = await db.TypesProvider.findOne({ where: { id: q.id_type_provider, status: true }, attributes: ['code'], raw: true });
    if (type?.code !== 'A') throw Object.assign(new Error('Tipo de entidad solo corresponde a proveedores de tipo Empresas'), { statusCode: 400 });
  }
  if (q.id_sucursales?.length && branches) {
    const invalid = q.id_sucursales.find(id => !branches.includes(id));
    if (invalid) throw Object.assign(new Error('No tiene acceso a esa sucursal'), { statusCode: 403 });
  }
  if (q.id_storages?.length) {
    const storages = await db.Storage.findAll({ where: { id: { [Op.in]: q.id_storages } } });
    for (const storage of storages) {
      if (!storage.status || (branches && !branches.includes(storage.id_sucursal))) {
        throw Object.assign(new Error('Almacén no disponible'), { statusCode: 403 });
      }
      if (q.id_sucursales?.length && !q.id_sucursales.includes(Number(storage.id_sucursal))) {
        throw Object.assign(new Error('El almacén no pertenece a la sucursal seleccionada'), { statusCode: 400 });
      }
    }
  }
  return { q, branches };
}

async function search(raw, user) {
  const { q, branches } = await normalizeScopedQuery(raw, user);
  const { sql, replacements } = buildQuery(q, branches);
  const [result] = await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  const total = Number(result.total); const from = (q.page - 1) * q.limit;
  return { previousPage: q.page > 1 ? q.page - 1 : null, currentPage: q.page, nextPage: from + q.limit < total ? q.page + 1 : null, total, total_all: total, per_page: q.limit, from: total ? from + 1 : 0, to: Math.min(from + q.limit, total), data: result.data };
}

async function catalogs(user) {
  const branches = assignedBranches(user);
  const storageWhere = { status: true, ...(branches ? { id_sucursal: { [Op.in]: branches } } : {}) };
  const options = (attributes, where = { status: true }) => ({ attributes, where, order: [['id', 'ASC']], raw: true });
  const availabilityWhere = { status: true, ...(branches ? { id_sucursal: { [Op.in]: branches } } : {}) };
  const activeAssignments = await db.ProviderSucursalAvailability.findAll({
    attributes: ['id_provider', 'id_sucursal'],
    where: availabilityWhere,
    include: [{ association: 'provider', attributes: [], where: { status: true }, required: true }],
    raw: true,
  });
  const activeProviderIds = [...new Set(activeAssignments.map(row => Number(row.id_provider)).filter(Number.isInteger))];
  const activeBranchIds = [...new Set(activeAssignments.map(row => Number(row.id_sucursal)).filter(Number.isInteger))];
  const branchWhere = { status: true, id: { [Op.in]: activeBranchIds } };
  const [sucursales, storages, categories, products, types, users, locations, departments] = await Promise.all([
    db.Sucursal.findAll(options(['id', 'name', 'city'], branchWhere)),
    db.Storage.findAll(options(['id', 'name', 'id_sucursal'], storageWhere)),
    db.Category.findAll(options(['id', 'name'])), db.Product.findAll(options(['id', 'name', 'id_category'])),
    db.TypesProvider.findAll({ attributes: ['id', 'name', 'code'], where: { status: true }, order: [['id', 'ASC']], raw: true }),
    db.User.findAll(options(['id', 'full_names', 'role'])),
    activeProviderIds.length
      ? db.ProviderBranch.findAll(options(['id', 'department', 'city'], { status: true, id_provider: { [Op.in]: activeProviderIds } }))
      : [],
    activeProviderIds.length
      ? db.Provider.findAll(options(['id', 'department'], { status: true, id: { [Op.in]: activeProviderIds } }))
      : [],
  ]);
  const unique = values => [...new Set(values.filter(Boolean))].sort().map(name => ({ name, value: name }));
  const cities = [...new Map(locations.filter(row => row.city).map(row => [JSON.stringify([row.department, row.city]), { name: row.city, value: row.city, department: row.department }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { branches: sucursales, storages, categories, products, types, users, departments: unique([...locations, ...departments].map(row => row.department)), cities };
}

async function exportRows(raw, user) {
  const { q, branches } = await normalizeScopedQuery({ ...raw, status: true, purchase_status: 'ACTIVE' }, user);
  const { sql, replacements } = buildQuery(q, branches, { unpaginated: true, purchaseDetails: true });
  const [result] = await db.sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  return result.data;
}

module.exports = { search, exportRows, catalogs, assignedBranches, normalizeScopedQuery };

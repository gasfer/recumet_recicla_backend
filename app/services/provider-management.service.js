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
  const branchWhere = { status: true, ...(branches ? { id: { [Op.in]: branches } } : {}) };
  const storageWhere = { status: true, ...(branches ? { id_sucursal: { [Op.in]: branches } } : {}) };
  const options = (attributes, where = { status: true }) => ({ attributes, where, order: [['id', 'ASC']], raw: true });
  const [sucursales, storages, categories, products, types, users, locations, departments] = await Promise.all([
    db.Sucursal.findAll(options(['id', 'name', 'city'], branchWhere)),
    db.Storage.findAll(options(['id', 'name', 'id_sucursal'], storageWhere)),
    db.Category.findAll(options(['id', 'name'])), db.Product.findAll(options(['id', 'name', 'id_category'])),
    db.TypesProvider.findAll({ attributes: ['id', 'name', 'code'], order: [['id', 'ASC']], raw: true }),
    db.User.findAll(options(['id', 'full_names'])),
    db.ProviderBranch.findAll(options(['id', 'department', 'city'])),
    db.Provider.findAll(options(['id', 'department'])),
  ]);
  const unique = values => [...new Set(values.filter(Boolean))].sort().map(name => ({ name, value: name }));
  return { branches: sucursales, storages, categories, products, types, users, departments: unique([...locations, ...departments].map(row => row.department)), cities: unique(locations.map(row => row.city)) };
}

module.exports = { search, catalogs, assignedBranches, normalizeScopedQuery };

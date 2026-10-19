'use strict';
const db = require('../database/config');
const { Op } = require('sequelize');
const { resolveOperationalCompany } = require('../helpers/decimals-value');

async function providerReportHeader(query, catalogs, companyId) {
  const id = companyId || (await resolveOperationalCompany()).id;
  const company = await db.Company.findOne({ where: { id, status: true }, attributes: ['id', 'nit', 'email', 'cellphone'], raw: true });
  const ids = value => String(value || '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);
  const selectedIds = ids(query.id_sucursales || query.id_sucursal);
  const storageIds = ids(query.id_storages || query.id_storage);
  const storageBranches = (catalogs.storages || []).filter(s => storageIds.includes(Number(s.id))).map(s => Number(s.id_sucursal));
  const branchIds = (catalogs.branches || []).filter(b => (!selectedIds.length || selectedIds.includes(Number(b.id))) && (!storageIds.length || storageBranches.includes(Number(b.id)))).map(b => b.id);
  const branches = branchIds.length ? await db.Sucursal.findAll({
    where: { id: { [Op.in]: branchIds }, id_company: id, status: true },
    attributes: ['name', 'city', 'email', 'cellphone'], order: [['name', 'ASC']], raw: true,
  }) : [];
  const unique = values => [...new Set(values.filter(value => value !== null && value !== undefined && String(value).trim() !== '').map(String))].join(' · ');
  return {
    city: unique(branches.map(b => b.city)), nit: company?.nit,
    phone: unique([...branches.map(b => b.cellphone), company?.cellphone]),
    email: unique([...branches.map(b => b.email), company?.email]),
    branchName: unique(branches.map(b => b.name)),
  };
}

module.exports = { providerReportHeader };

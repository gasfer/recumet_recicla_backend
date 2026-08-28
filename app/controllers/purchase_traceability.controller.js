'use strict';

const { request, response } = require('express');
const { Op } = require('sequelize');
const { PurchaseAuditEvent, Input } = require('../database/config');

const positiveInt = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const dateWhere = (from, to) => {
  if (!from && !to) return undefined;
  return { ...(from ? { [Op.gte]: new Date(from) } : {}), ...(to ? { [Op.lte]: new Date(`${to}T23:59:59.999`) } : {}) };
};
const eventIncludes = [
  { association: 'actor', attributes: ['id', 'full_names', 'role'] },
  { association: 'authorizer', attributes: ['id', 'full_names', 'role'], required: false },
  { association: 'detail', required: false, include: [{ association: 'product', attributes: ['id', 'cod', 'name'], required: false }] },
];

const getPurchaseTraceability = async (req = request, res = response) => {
  try {
    const idInput = Number(req.params.id_input);
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, 25), 100);
    const input = await Input.findByPk(idInput, { include: [
      { association: 'provider' }, { association: 'sucursal', attributes: ['id', 'name'] }, { association: 'user', attributes: ['id', 'full_names', 'role'] },
      { association: 'detailsInput', required: false, include: [{ association: 'product', required: false }] },
      { association: 'accounts_payable', required: false, include: [{ association: 'abonosAccountsPayable', required: false, include: [{ association: 'user', attributes: ['id', 'full_names'] }] }] },
    ] });
    if (!input) return res.status(404).json({ ok: false, errors: [{ msg: 'La compra no existe.' }] });
    const where = { id_input: idInput };
    if (req.query.event_type) where.event_type = req.query.event_type;
    if (req.query.id_user) where.id_actor_user = req.query.id_user;
    const dates = dateWhere(req.query.from, req.query.to);
    if (dates) where.createdAt = dates;
    const { rows, count } = await PurchaseAuditEvent.findAndCountAll({ where, include: eventIncludes, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit });
    return res.json({ ok: true, traceability: { purchase: input, events: rows, pagination: { page, limit, total: count, pages: Math.ceil(count / limit) } } });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo consultar la trazabilidad de la compra.' }] });
  }
};

module.exports = { getPurchaseTraceability };

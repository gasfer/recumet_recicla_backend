'use strict';

const { request, response } = require('express');
const { Op } = require('sequelize');
const { PurchaseAuditEvent, Input, Provider } = require('../database/config');

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

const assignedBranchIds = (user) => user?.role === 'ADMINISTRADOR'
  ? null
  : (user?.assign_sucursales || []).map((item) => Number(item.id_sucursal)).filter(Number.isInteger);
const canAccessBranch = (user, branchId) => {
  const assigned = assignedBranchIds(user);
  return assigned === null || assigned.includes(Number(branchId));
};
const scopedInputWhere = (req, where = {}) => {
  const assigned = assignedBranchIds(req.userAuth);
  return assigned === null ? where : { ...where, id_sucursal: { [Op.in]: assigned } };
};

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
    if (!canAccessBranch(req.userAuth, input.id_sucursal)) {
      return res.status(403).json({ ok: false, errors: [{ msg: 'No tiene acceso a la sucursal de esta compra.' }] });
    }
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

const getProviderTraceability = async (req = request, res = response) => {
  try {
    const idProvider = Number(req.params.id_provider);
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, 25), 100);
    const provider = await Provider.findByPk(idProvider);
    if (!provider) return res.status(404).json({ ok: false, errors: [{ msg: 'El proveedor no existe.' }] });

    const baseWhere = { id_provider: idProvider };
    if (req.query.status) baseWhere.status = req.query.status;
    if (req.query.boleta) baseWhere[Op.or] = [
      { cod: { [Op.iLike]: `%${req.query.boleta}%` } },
      { registry_number: { [Op.iLike]: `%${req.query.boleta}%` } },
    ];
    const dates = dateWhere(req.query.from, req.query.to);
    if (dates) baseWhere.date_voucher = dates;
    const where = scopedInputWhere(req, baseWhere);
    const accountInclude = { association: 'accounts_payable', required: false,
      include: [{ association: 'abonosAccountsPayable', required: false }] };
    const purchaseInclude = [
      { association: 'sucursal', attributes: ['id', 'name'] },
      { association: 'user', attributes: ['id', 'full_names', 'role'] },
      { association: 'detailsInput', required: false, include: [{ association: 'product', required: false }] },
      accountInclude,
    ];
    const [allPurchases, purchasePage] = await Promise.all([
      Input.findAll({ where, include: [accountInclude], order: [['date_voucher', 'DESC'], ['id', 'DESC']] }),
      Input.findAndCountAll({ where, include: purchaseInclude, distinct: true,
        order: [['date_voucher', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit }),
    ]);
    const pageIds = purchasePage.rows.map((item) => item.id);
    const eventWhere = { id_input: { [Op.in]: pageIds } };
    if (req.query.event_type) eventWhere.event_type = req.query.event_type;
    if (req.query.id_user) eventWhere.id_actor_user = Number(req.query.id_user);
    if (dates) eventWhere.createdAt = dates;
    const events = pageIds.length ? await PurchaseAuditEvent.findAll({
      where: eventWhere, include: eventIncludes, order: [['createdAt', 'DESC'], ['id', 'DESC']],
    }) : [];
    const totals = allPurchases.reduce((summary, purchase) => {
      const total = Number(purchase.total || 0);
      const isVoided = purchase.status === 'INACTIVE' || purchase.status === false;
      if (isVoided) summary.voided += total;
      else summary.purchased += total;
      const account = purchase.accounts_payable;
      if (account && account.status !== false) {
        summary.paid += Number(account.monto_abonado || 0);
        summary.pending += Number(account.monto_restante || 0);
      }
      return summary;
    }, { purchased: 0, paid: 0, pending: 0, voided: 0 });
    return res.json({ ok: true, traceability: {
      provider, purchases: purchasePage.rows, events, totals,
      pagination: { page, limit, total: purchasePage.count, pages: Math.ceil(purchasePage.count / limit) },
    } });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo consultar la trazabilidad del proveedor.' }] });
  }
};

const getPurchaseAuthorizers = async (_req, res) => {
  try {
    const { listAuthorizers } = require('../services/purchase-authorization.service');
    return res.json({ ok: true, users: await listAuthorizers() });
  } catch {
    return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudieron cargar los responsables de autorización.' }] });
  }
};
module.exports = { getPurchaseTraceability, getProviderTraceability, getPurchaseAuthorizers };

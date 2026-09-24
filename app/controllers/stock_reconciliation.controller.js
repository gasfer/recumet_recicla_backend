'use strict';

const { request, response } = require('express');
const {
  detectCases,
  listCases,
  getCase,
  investigateCase,
  previewCase,
  resolveCase,
  resolveCases,
  listAuthorizers,
  listCountResponsibles,
} = require('../services/stock-reconciliation.service');
const { sendPermissionDenied } = require('../helpers/permission-denied');

const errorResponse = (res, error) => res.status(error.statusCode || 500).json({
  ok: false,
  errors: [{ msg: error.statusCode ? error.message : 'Ocurrió un imprevisto interno | hable con soporte' }],
  ...(error.details ? { details: error.details } : {}),
});

const canAccessSucursal = (user, idSucursal) => user?.role === 'ADMINISTRADOR' || (
  (user?.assign_sucursales || []).some(({ id_sucursal, status }) => status !== false && Number(id_sucursal) === Number(idSucursal))
);

const ensureCaseAccess = async (req, res) => {
  const record = await getCase(req.params.id);
  if (!canAccessSucursal(req.userAuth, record.id_sucursal)) {
    sendPermissionDenied(res, 'acceder a conciliaciones Stock–Kardex de esta sucursal');
    return null;
  }
  return record;
};

const detect = async (req = request, res = response) => {
  try {
    if (!req.body.id_sucursal || !canAccessSucursal(req.userAuth, req.body.id_sucursal)) {
      return sendPermissionDenied(res, 'detectar conciliaciones Stock–Kardex sin una sucursal autorizada');
    }
    const result = await detectCases({
      idSucursal: req.body.id_sucursal,
      idStorage: req.body.id_storage,
      actorUserId: req.userAuth.id,
      limit: req.body.limit,
    });
    return res.status(200).json({ ok: true, ...result, inventory_modified: false });
  } catch (error) { return errorResponse(res, error); }
};

const list = async (req = request, res = response) => {
  try {
    if (!req.query.id_sucursal || !canAccessSucursal(req.userAuth, req.query.id_sucursal)) {
      return sendPermissionDenied(res, 'consultar conciliaciones Stock–Kardex sin una sucursal autorizada');
    }
    const cases = await listCases({
      page: req.query.page,
      limit: req.query.limit,
      idSucursal: req.query.id_sucursal,
      idStorage: req.query.id_storage,
      status: req.query.status,
      direction: req.query.direction,
      query: req.query.query,
    });
    return res.status(200).json({ ok: true, cases });
  } catch (error) { return errorResponse(res, error); }
};

const getOne = async (req = request, res = response) => {
  try {
    const record = await ensureCaseAccess(req, res);
    if (!record) return undefined;
    return res.status(200).json({ ok: true, case: record });
  } catch (error) { return errorResponse(res, error); }
};

const authorizers = async (req = request, res = response) => {
  try {
    if (!req.query.id_sucursal || !canAccessSucursal(req.userAuth, req.query.id_sucursal)) {
      return sendPermissionDenied(res, 'consultar autorizadores fuera de una sucursal autorizada');
    }
    return res.status(200).json({ ok: true, users: await listAuthorizers({ sucursalId: req.query.id_sucursal }) });
  } catch (error) { return errorResponse(res, error); }
};

const countResponsibles = async (req = request, res = response) => {
  try {
    if (!req.query.id_sucursal || !canAccessSucursal(req.userAuth, req.query.id_sucursal)) {
      return sendPermissionDenied(res, 'consultar responsables de conteo fuera de una sucursal autorizada');
    }
    return res.status(200).json({ ok: true, users: await listCountResponsibles({ sucursalId: req.query.id_sucursal }) });
  } catch (error) { return errorResponse(res, error); }
};

const investigate = async (req = request, res = response) => {
  try {
    if (!await ensureCaseAccess(req, res)) return undefined;
    const record = await investigateCase({
      caseId: req.params.id,
      actorUserId: req.userAuth.id,
      physicalCount: req.body.physical_count,
      cause: req.body.cause,
      notes: req.body.notes,
      strategy: req.body.strategy,
      assignedUserId: req.body.assigned_user_id,
      sourceReferenceType: req.body.source_reference_type,
      sourceReferenceCode: req.body.source_reference_code,
      evidences: req.body.evidences,
    });
    return res.status(200).json({ ok: true, case: record });
  } catch (error) { return errorResponse(res, error); }
};

const preview = async (req = request, res = response) => {
  try {
    if (!await ensureCaseAccess(req, res)) return undefined;
    return res.status(200).json({ ok: true, preview: await previewCase(req.params.id) });
  } catch (error) { return errorResponse(res, error); }
};

const resolve = async (req = request, res = response) => {
  try {
    if (!await ensureCaseAccess(req, res)) return undefined;
    const result = await resolveCase({
      caseId: req.params.id,
      actorUserId: req.userAuth.id,
      authorizedUserId: req.body.authorized_user_id,
      idempotencyKey: req.body.idempotency_key,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) { return errorResponse(res, error); }
};

const batchResolve = async (req = request, res = response) => {
  try {
    const items = Array.isArray(req.body.cases) ? req.body.cases : [];
    for (const item of items) {
      req.params.id = item.case_id;
      if (!await ensureCaseAccess(req, res)) return undefined;
    }
    const results = await resolveCases({ cases: items, actorUserId: req.userAuth.id });
    return res.status(200).json({ ok: true, results, partial: results.some(({ ok }) => !ok) });
  } catch (error) { return errorResponse(res, error); }
};

module.exports = { detect, list, getOne, authorizers, countResponsibles, investigate, preview, resolve, batchResolve };

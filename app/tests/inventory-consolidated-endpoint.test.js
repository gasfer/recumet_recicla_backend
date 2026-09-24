'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const db = require('../database/config');
const {
  generatePdfReportsTotalStock,
  generateExcelReportsTotalStock,
  generateExcelConsolidatedReportsTotalStock,
} = require('../controllers/reports/total-stock-recumet.controller');
const { authorizeModulePermission } = require('../middlewares/authorize-module-permission');

const createResponseMock = () => {
  const headers = {};
  let statusCode = 200;
  const chunks = [];
  let onFinishResolve;
  const finishedPromise = new Promise((resolve) => {
    onFinishResolve = resolve;
  });

  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });

  res.statusCode = statusCode;
  res.headers = headers;
  res.setHeader = (name, val) => {
    headers[name.toLowerCase()] = val;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    onFinishResolve(data);
    res.end();
    return res;
  };
  res.send = (data) => {
    res.body = data;
    onFinishResolve(data);
    res.end();
    return res;
  };

  res.on('finish', () => {
    onFinishResolve(res.body || Buffer.concat(chunks.filter(Boolean)));
  });

  res.waitForFinish = () => finishedPromise;

  return res;
};

test('authorizeModulePermission("KARDEX", "reports") deniega acceso a usuarios sin permiso', () => {
  const middleware = authorizeModulePermission('KARDEX', 'reports');

  // Usuario sin permisos
  const reqNoPerm = {
    userAuth: {
      role: 'OPERADOR',
      assign_permission: [],
    },
  };
  const resNoPerm = createResponseMock();
  let nextCalled = false;
  middleware(reqNoPerm, resNoPerm, () => { nextCalled = true; });

  assert.equal(nextCalled, false, 'No debe llamar a next() si no tiene permisos');
  assert.equal(resNoPerm.statusCode, 403, 'Debe responder 403 Forbidden');
  assert.equal(resNoPerm.body.ok, false);

  // Usuario con permiso de reports
  const reqWithPerm = {
    userAuth: {
      role: 'OPERADOR',
      assign_permission: [
        { module: 'KARDEX', reports: true, status: true },
      ],
    },
  };
  const resWithPerm = createResponseMock();
  let nextCalledPerm = false;
  middleware(reqWithPerm, resWithPerm, () => { nextCalledPerm = true; });
  assert.equal(nextCalledPerm, true, 'Debe llamar a next() si tiene permiso');

  // Usuario Administrador siempre permitido
  const reqAdmin = {
    userAuth: {
      role: 'ADMINISTRADOR',
      assign_permission: [],
    },
  };
  const resAdmin = createResponseMock();
  let nextCalledAdmin = false;
  middleware(reqAdmin, resAdmin, () => { nextCalledAdmin = true; });
  assert.equal(nextCalledAdmin, true, 'Debe llamar a next() para ADMINISTRADOR');
});

test('generateExcelConsolidatedReportsTotalStock genera archivo con Content-Disposition y headers esperados', async (t) => {
  t.mock.method(db.Sucursal, 'findAll', async () => [
    { id: 1, name: 'CASA MATRIZ' },
  ]);

  t.mock.method(db.Product, 'findAll', async () => [
    {
      id: 10,
      cod: 'MP-01',
      name: 'Materia Prima 1',
      category: { id: 1, name: 'METALES', type: 'RAW_MATERIAL' },
      unit: { id: 1, name: 'KG', siglas: 'KG' },
    },
  ]);

  t.mock.method(db.ViewKardex, 'findAll', async (options) => {
    if (options.attributes && options.attributes.some(attr => Array.isArray(attr) && attr[1] === 'min_id')) {
      return [];
    }
    return [{ id_product: 10, id_sucursal: 1, quantity_saldo: 50 }];
  });

  t.mock.method(db.Transfers, 'findAll', async () => []);
  if (db.TransferReviewInventoryHold) {
    t.mock.method(db.TransferReviewInventoryHold, 'findAll', async () => []);
  }

  // Tracking spies to guarantee read-only execution (Task 4.4)
  let stockCreatedOrUpdated = false;
  let kardexCreatedOrUpdated = false;
  t.mock.method(db.Stock, 'create', async () => { stockCreatedOrUpdated = true; });
  t.mock.method(db.Stock, 'update', async () => { stockCreatedOrUpdated = true; });
  t.mock.method(db.Kardex, 'create', async () => { kardexCreatedOrUpdated = true; });
  t.mock.method(db.Kardex, 'update', async () => { kardexCreatedOrUpdated = true; });

  const req = {
    query: {
      filterBy: 'RANGE',
      date1: '01-08-2026',
      date2: '29-08-2026',
      showZeroSaldo: 'true',
    },
    userAuth: { full_names: 'Admin', role: 'ADMINISTRADOR' },
  };
  const res = createResponseMock();

  await generateExcelConsolidatedReportsTotalStock(req, res);
  await res.waitForFinish();

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(res.headers['content-disposition'], 'attachment; filename=consolidado_inventario_2026-08-29.xlsx');

  // Operación estrictamente de solo lectura
  assert.equal(stockCreatedOrUpdated, false, 'No debe crear ni actualizar Stock');
  assert.equal(kardexCreatedOrUpdated, false, 'No debe crear ni actualizar Kardex');
});

test('Regresión: generatePdfReportsTotalStock y generateExcelReportsTotalStock continúan funcionando sin cambios', async (t) => {
  t.mock.method(db.ViewKardex, 'findAll', async () => []);

  const req = {
    query: { filterBy: 'DAY', date1: '29-08-2026' },
    userAuth: { full_names: 'Usuario Test', number_document: '123456' },
  };

  const resPdf = createResponseMock();
  await generatePdfReportsTotalStock(req, resPdf);
  await resPdf.waitForFinish();
  assert.equal(resPdf.statusCode, 200);
  assert.equal(resPdf.headers['content-type'], 'application/pdf;');

  const resExcel = createResponseMock();
  await generateExcelReportsTotalStock(req, resExcel);
  await resExcel.waitForFinish();
  assert.equal(resExcel.statusCode, 200);
  assert.equal(resExcel.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(resExcel.headers['content-disposition'], /filename=consolidado_stock_/);
});

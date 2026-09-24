'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const inputRouter = require('../routes/input');
const { assignPermission } = require('../database/config');

const currentHandler = (router, path) => {
  const route = router.stack.find(layer => layer.route?.path === path)?.route;
  assert.ok(route, `Falta registrar la ruta ${path}`);
  const layers = route.stack.filter(layer => typeof layer.handle === 'function');
  return layers.at(-1).handle;
};

const reportPermission = granted => assignPermission.build({
  module: 'REPORTE COMPRAS',
  status: true,
  reports: granted,
});

const findReportMiddleware = (router, path) => {
  const route = router.stack.find(layer => layer.route?.path === path)?.route;
  assert.ok(route, `Falta registrar la ruta ${path}`);

  const middleware = route.stack.find(layer => (
    layer.handle.modulePermission?.module === 'REPORTE COMPRAS'
    && layer.handle.modulePermission?.action === 'reports'
  ))?.handle;
  assert.ok(middleware, `${path} debe conservar la protección REPORTE COMPRAS.reports`);
  return middleware;
};

const response = () => ({
  code: undefined,
  body: undefined,
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const reportRoutes = [
  ['listado del reporte', '/purchase-report'],
  ['Excel del reporte', '/purchase-report/excel'],
  ['PDF del reporte', '/purchase-report/pdf'],
  ['PDF resumen por producto', '/purchase-report/pdf/details'],
  ['PDF detalle costo promedio', '/purchase-report/pdf/details/cpp'],
  ['Excel resumen por producto', '/purchase-report/excel/details'],
  ['Excel resumen por producto (ruta dedicada)', '/purchase-report/excel/summary-by-product'],
];

for (const [name, path] of reportRoutes) {
  test(`la ruta de ${name} responde 403 sin permiso de reportes`, () => {
    const middleware = findReportMiddleware(inputRouter, path);
    const res = response();
    let nextCalled = false;

    middleware({
      userAuth: {
        role: 'OPERADOR',
        assign_permission: [reportPermission(false)],
      },
    }, res, () => { nextCalled = true; });

    assert.equal(res.code, 403);
    assert.equal(res.body.ok, false);
    assert.match(res.body.errors[0].msg, /generar reportes.*el módulo REPORTE COMPRAS/);
    assert.equal(nextCalled, false);
  });

  test(`la ruta de ${name} permite superar el middleware con permiso de reportes`, () => {
    const middleware = findReportMiddleware(inputRouter, path);
    let nextCalled = false;

    middleware({
      userAuth: {
        role: 'OPERADOR',
        assign_permission: [reportPermission(true)],
      },
    }, response(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  test(`la ruta de ${name} permite superar el middleware al Administrador`, () => {
    const middleware = findReportMiddleware(inputRouter, path);
    let nextCalled = false;

    middleware({
      userAuth: { role: 'ADMINISTRADOR', assign_permission: [] },
    }, response(), () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });
}

test('la ruta operativa /input/pdf sigue conectada al PDF operativo, no al del reporte', () => {
  const operationalPdf = currentHandler(inputRouter, '/pdf');
  const reportPdf = currentHandler(inputRouter, '/purchase-report/pdf');
  const { generatePdfReports } = require('../controllers/reports/input.controller');
  const { generatePurchaseReportPdf } = require('../controllers/purchase-report.controller');
  assert.equal(operationalPdf, generatePdfReports);
  assert.equal(reportPdf, generatePurchaseReportPdf);
  assert.notEqual(operationalPdf, reportPdf);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePurchaseReportFilters } = require('../services/purchase-report-filters.service');
const { restrictToAuthorizedBranches, reportFilterSummary, buildPurchaseReportPdfBody } = require('../controllers/purchase-report.controller');

test('el reporte normaliza filtros y descarta ordenamientos no admitidos', () => {
  const filters = normalizePurchaseReportFilters({
    filterBy: 'RANGE', date1: '01-09-2026', date2: '30-09-2026',
    id_sucursal: '1,2,inválido', id_storage: '4', category_ids: '8,9', id_products: '20,21',
    status: 'ACTIVE', type_pay: 'CONTADO', field_sort: 'total; DROP TABLE inputs', order: 'invalid',
  });

  assert.deepEqual(filters.sucursalIds, [1, 2]);
  assert.deepEqual(filters.categoryIds, [8, 9]);
  assert.equal(filters.fieldSort, 'date_voucher');
  assert.equal(filters.direction, 'DESC');
  assert.equal(filters.typePay, 'CONTADO');
});

test('el reporte limita sucursales solicitadas al alcance autorizado', () => {
  const params = restrictToAuthorizedBranches(
    { id_sucursal: '1,4', id_storage: '9' },
    { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }, { id_sucursal: 2 }] },
  );
  assert.equal(params.id_sucursal, '1');

  const defaultScope = restrictToAuthorizedBranches(
    {}, { role: 'OPERADOR', assign_sucursales: [{ id_sucursal: 1 }, { id_sucursal: 2 }] },
  );
  assert.equal(defaultScope.id_sucursal, '1,2');
});

test('el encabezado siempre muestra el período seleccionado', () => {
  const month = reportFilterSummary({ filterBy: 'MONTH', date1: '09', date2: '2026', report_filters: 'Sucursales: Casa Matriz' });
  assert.equal(month[0], 'Período mensual: Septiembre de 2026');

  const range = reportFilterSummary({ filterBy: 'RANGE', date1: '01-09-2026', date2: '19-09-2026' });
  assert.equal(range[0], 'Período: 01/09/2026 al 19/09/2026');
});

test('el PDF conserva las columnas y agrupación del Excel sin exceder la carta horizontal', () => {
  const body = buildPurchaseReportPdfBody([{
    cod: 'COMP00001', date_voucher: '2026-09-01T10:00:00', type_registry: 'BOLETA', registry_number: '100',
    type: 'CONTADO', total_quantity: 15, total: 200, provider: { full_names: 'Proveedor A', type: { name: 'MAYORISTA' } },
    detailsInput: [{ quantity: 15, product: { name: 'Material', unit: { siglas: 'KGR' } } }],
  }], 2);
  assert.equal(body[0].length, 10);
  assert.match(body[1][0].text, /PROVEEDOR: Proveedor A/);
  assert.equal(body.at(-1)[0].text, 'TOTAL GENERAL');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePurchaseReportFilters, buildPurchaseReportWhere } = require('../services/purchase-report-filters.service');
const { Op } = require('sequelize');
const { restrictToAuthorizedBranches, reportFilterSummary, buildPurchaseReportPdfBody } = require('../controllers/purchase-report.controller');
const db = require('../database/config');
const { queryPurchaseReportPage, queryPurchaseReportExport } = require('../services/purchase-report-query.service');

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
  const where = buildPurchaseReportWhere(filters);
  assert.ok(where[Op.and].some(item => item.status === 'ACTIVE'));
  const date = where[Op.and].find(item => item.date_voucher);
  assert.equal(date.date_voucher[Op.gte].toISOString(), '2026-09-01T04:00:00.000Z');
  assert.equal(date.date_voucher[Op.lt].toISOString(), '2026-10-01T04:00:00.000Z');
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

test('la página del reporte proyecta sólo campos visibles y del modal de detalle', async (t) => {
  const inputAttributes = [];
  t.mock.method(db.Input, 'count', async () => 1);
  t.mock.method(db.Input, 'findAll', async options => {
    inputAttributes.push(options.attributes);
    if (options.raw) return [{ id: 1 }];
    if (options.attributes?.includes('payment_voucher')) return [{ dataValues: { id: 1 }, detailsInput: [] }];
    return [{ dataValues: { id: 1 }, detailsInput: [] }];
  });

  const result = await queryPurchaseReportPage({ filterBy: 'MONTH', date1: '10', date2: '2026', status: 'ACTIVE', page: 1, limit: 50 });

  assert.equal(result.data.length, 1);
  assert.ok(inputAttributes.some(attributes => attributes.includes('payment_voucher') && attributes.includes('comments')));
  assert.ok(inputAttributes.every(attributes => !attributes.includes('number_transaction')));
});

test('las exportaciones proyectan únicamente los campos de sus documentos', async (t) => {
  let attributes;
  t.mock.method(db.Input, 'findAll', async options => { attributes = options.attributes; return []; });

  await queryPurchaseReportExport({ filterBy: 'MONTH', date1: '10', date2: '2026', status: 'ACTIVE' });

  assert.deepEqual(attributes, [
    'id', 'cod', 'date_voucher', 'type', 'type_registry', 'registry_number', 'total',
    'referral_sources', 'old_customer', 'with_pickup', 'id_provider',
  ]);
});

test('listado y exportación aplican los mismos filtros analíticos', async (t) => {
  let pageWhere;
  let exportWhere;
  t.mock.method(db.Input, 'count', async options => { pageWhere = options.where; return 0; });
  t.mock.method(db.Input, 'findAll', async options => {
    if (options.attributes?.includes('id_provider')) exportWhere = options.where;
    return [];
  });
  const filters = {
    filterBy: 'MONTH', date1: '10', date2: '2026', id_sucursal: '1', id_storage: '2',
    category_ids: '3', id_products: '4', status: 'ACTIVE', type_pay: 'CONTADO',
    type: 'cod', query: 'COMP', field_sort: 'date_voucher', order: 'DESC',
  };

  await queryPurchaseReportPage({ ...filters, page: 1, limit: 50 });
  await queryPurchaseReportExport(filters);

  assert.deepEqual(exportWhere, pageWhere);
  const criteria = pageWhere[Op.and];
  assert.ok(criteria.some(item => item.id_sucursal?.[Op.in]?.includes(1)));
  assert.ok(criteria.some(item => item.id_storage?.[Op.in]?.includes(2)));
  const productSubquery = criteria.find(item => item.id)?.id?.[Op.in]?.val || '';
  assert.match(productSubquery, /product\.id_category IN \(3\)/);
  assert.match(productSubquery, /detail\.id_product IN \(4\)/);
  assert.ok(criteria.some(item => item.type === 'CONTADO'));
  assert.ok(criteria.some(item => item.cod?.[Op.iLike] === '%COMP%'));
});

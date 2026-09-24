'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const moment = require('moment');
const {
  resolveCutoffDate,
  normalizeArrayParam,
  normalizeReportFilters,
} = require('../services/inventory-consolidated-query.service');

test('normalizeArrayParam convierte strings separados por coma, arrays y valores simples', () => {
  assert.deepEqual(normalizeArrayParam('1, 2, 3'), ['1', '2', '3']);
  assert.deepEqual(normalizeArrayParam([4, 5, '6']), ['4', '5', '6']);
  assert.deepEqual(normalizeArrayParam(' 9 '), ['9']);
  assert.deepEqual(normalizeArrayParam(null), []);
  assert.deepEqual(normalizeArrayParam(undefined), []);
  assert.deepEqual(normalizeArrayParam(''), []);
});

test('normalizeReportFilters normaliza filtros de sucursales, almacenes, categorías, productos, búsqueda y saldos cero', () => {
  const rawQuery = {
    id_sucursales: '1,2',
    id_storages: '10,20',
    id_products: '101,102',
    category_ids: ['5', '6'],
    showZeroSaldo: 'true',
    query: '  cobre  ',
    fieldSort: 'product.name',
    order: 'DESC',
    filterBy: 'RANGE',
    date1: '01-08-2026',
    date2: '29-08-2026',
  };

  const normalized = normalizeReportFilters(rawQuery);
  assert.deepEqual(normalized.sucursales, ['1', '2']);
  assert.deepEqual(normalized.storages, ['10', '20']);
  assert.deepEqual(normalized.products, ['101', '102']);
  assert.deepEqual(normalized.categories, ['5', '6']);
  assert.equal(normalized.showZeroSaldo, true);
  assert.equal(normalized.querySearch, 'cobre');
  assert.equal(normalized.orderField, 'name');
  assert.equal(normalized.orderDir, 'DESC');
  assert.equal(normalized.cutoffInfo.fileDateStr, '2026-08-29');
});

test('normalizeReportFilters admite fallback a nombres singulares de filtros', () => {
  const rawQuery = {
    id_sucursal: '3',
    id_storage: '30',
    id_product: '300',
    include_zero: true,
    orderNew: ['product', 'cod', 'ASC'],
    filterBy: 'DAY',
    date1: '15-08-2026',
  };

  const normalized = normalizeReportFilters(rawQuery);
  assert.deepEqual(normalized.sucursales, ['3']);
  assert.deepEqual(normalized.storages, ['30']);
  assert.deepEqual(normalized.products, ['300']);
  assert.equal(normalized.showZeroSaldo, true);
  assert.equal(normalized.orderField, 'cod');
  assert.equal(normalized.orderDir, 'ASC');
  assert.equal(normalized.cutoffInfo.fileDateStr, '2026-08-15');
});

test('resolveCutoffDate para RANGE toma date2 (o date1 si no hay date2) al final del día inclusivo', () => {
  const result = resolveCutoffDate('RANGE', '01-08-2026', '29-08-2026');
  assert.equal(result.fileDateStr, '2026-08-29');
  assert.equal(result.headerLabel, 'Al 29 de Agosto de 2026');
  assert.equal(result.cutoffMoment.hour(), 23);
  assert.equal(result.cutoffMoment.minute(), 59);
  assert.equal(result.cutoffMoment.second(), 59);

  // Verificación de límite inclusivo y exclusión de movimientos posteriores
  const movementSameDayAfternoon = moment('2026-08-29 18:30:00', 'YYYY-MM-DD HH:mm:ss');
  const movementNextDay = moment('2026-08-30 00:00:01', 'YYYY-MM-DD HH:mm:ss');

  assert.ok(movementSameDayAfternoon.isSameOrBefore(result.cutoffMoment), 'Movimiento de la tarde del día de corte debe ser incluido');
  assert.ok(movementNextDay.isAfter(result.cutoffMoment), 'Movimiento del día siguiente debe ser excluido');
});

test('resolveCutoffDate para DAY toma date1 al final del día inclusivo', () => {
  const result = resolveCutoffDate('DAY', '2026-08-15');
  assert.equal(result.fileDateStr, '2026-08-15');
  assert.equal(result.headerLabel, 'Al 15 de Agosto de 2026');
  assert.equal(result.cutoffMoment.format('YYYY-MM-DD HH:mm:ss'), '2026-08-15 23:59:59');
});

test('resolveCutoffDate para MONTH toma el último instante del mes seleccionado', () => {
  // date1 = mes '02' (febrero), date2 = '2024' (año bisiesto)
  const bisiesto = resolveCutoffDate('MONTH', '02', '2024');
  assert.equal(bisiesto.fileDateStr, '2024-02-29');
  assert.equal(bisiesto.headerLabel, 'Al 29 de Febrero de 2024');

  // date1 = mes '08' (agosto), date2 = '2026'
  const agosto = resolveCutoffDate('MONTH', '8', '2026');
  assert.equal(agosto.fileDateStr, '2026-08-31');
  assert.equal(agosto.headerLabel, 'Al 31 de Agosto de 2026');
});

test('resolveCutoffDate para YEAR toma el 31 de diciembre al final del año', () => {
  const result = resolveCutoffDate('YEAR', '2026');
  assert.equal(result.fileDateStr, '2026-12-31');
  assert.equal(result.headerLabel, 'Al 31 de Diciembre de 2026');
  assert.equal(result.cutoffMoment.format('YYYY-MM-DD HH:mm:ss'), '2026-12-31 23:59:59');
});

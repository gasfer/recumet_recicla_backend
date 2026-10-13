'use strict';
const { Op } = require('sequelize');
const db = require('../database/config');
const { normalizeReportFilters } = require('./inventory-consolidated-query.service');
const { purchasePeriod } = require('./purchases-by-branch-report.service');

async function selectedReportFilters(query = {}) {
  const filters = normalizeReportFilters(query);
  const catalogFields = [
    ['Sucursales', db.Sucursal, filters.sucursales, 'name'],
    ['Área / Almacén', db.Storage, filters.storages, 'name'],
    ['Categorías', db.Category, filters.categories, 'name'],
    ['Productos', db.Product, filters.products, 'name'],
    ['Tipo de proveedor', db.TypesProvider, query.id_type_provider ? [query.id_type_provider] : [], 'name'],
    ['Proveedor', db.Provider, query.id_provider ? [query.id_provider] : [], 'full_names'],
  ];
  const labels = await Promise.all(catalogFields.map(async ([label, model, ids, field]) => {
    if (!ids.length) return null;
    if (ids.some(id => !/^[1-9]\d*$/.test(String(id)))) { const error = new Error('Seleccione filtros válidos.'); error.statusCode = 400; throw error; }
    const records = await model.findAll({ attributes: ['id', field], where: { id: { [Op.in]: ids } }, raw: true });
    const names = new Map(records.map(record => [String(record.id), record[field]]));
    return label + ': ' + ids.map(id => names.get(String(id)) || String(id)).join(', ');
  }));
  const selected = labels.filter(Boolean);
  if (query.filterBy) selected.push('Tipo filtrado: ' + ({ RANGE: 'Rango', DAY: 'Día', MONTH: 'Mes', YEAR: 'Año' }[String(query.filterBy).toUpperCase()] || query.filterBy));
  if (query.date1) selected.push('Fecha: ' + purchasePeriod(filters).label);
  if (Object.hasOwn(query, 'showZeroSaldo')) selected.push('Saldos cero: ' + (filters.showZeroSaldo ? 'Incluidos' : 'Excluidos'));
  if (query.query) selected.push('Búsqueda: ' + query.query);
  return selected.join('\n');
}

function writeFilterHeader(sheet, { row, fromColumn = 1, toColumn, text }) {
  if (!text) return;
  const cell = sheet.getRow(row).getCell(fromColumn);
  cell.value = text;
  cell.font = { name: 'Arial', size: 8, color: { argb: 'FF334155' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  const width = Array.from({ length: toColumn - fromColumn + 1 }, (_, i) => sheet.getColumn(i + fromColumn).width || 12).reduce((a, b) => a + b, 0);
  const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(20, width * .85))), 0);
  sheet.getRow(row).height = Math.max(20, lines * 12 + 6);
}
module.exports = { selectedReportFilters, writeFilterHeader };

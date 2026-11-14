'use strict';

const { Op } = require('sequelize');

const SORT_FIELDS = Object.freeze({
  'product.cod': ['product', 'cod'],
  'product.name': ['product', 'name'],
  'product.unit.siglas': ['product', 'unit', 'siglas'],
  'product.category.name': ['product', 'category', 'name'],
  'storage.name': ['storage', 'name'],
  quantity_input: ['quantity_input'],
  quantity_output: ['quantity_output'],
  quantity_saldo: ['quantity_saldo'],
});

function buildPhysicalKardexOrder(field = 'product.cod', direction = 'ASC') {
  const path = SORT_FIELDS[field] || SORT_FIELDS['product.cod'];
  const normalizedDirection = String(direction).toUpperCase() === 'DESC' || Number(direction) === -1 ? 'DESC' : 'ASC';
  const requested = [...path, normalizedDirection];
  if (field === 'product.category.name') return [requested, ['product', 'cod', 'ASC']];
  return [['product', 'category', 'name', 'ASC'], requested];
}

function normalizePhysicalCategoryIds(value) {
  const values = (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean);
  if (!values.length) return [];
  const ids = values.map(Number);
  return ids.every(id => Number.isSafeInteger(id) && id > 0) ? [...new Set(ids)] : [0];
}

function addWhere(include, condition) {
  include.where = { ...(include.where || {}), ...condition };
  include.required = true;
}

function applyPhysicalKardexSearch(options, type, query) {
  const searchText = String(query ?? '').trim();
  if (!type || !searchText) return options;
  const numeric = /^\d+(?:\.\d+)?$/.test(searchText);
  const condition = numeric ? { [Op.eq]: searchText } : { [Op.iLike]: `%${searchText}%` };
  const path = String(type).split('.');
  const root = options.include?.find(item => item.association === path[0]);
  if (root && path.length === 2 && path[0] === 'product' && ['cod', 'name'].includes(path[1])) {
    addWhere(root, { [path[1]]: condition });
  } else if (root && path.length === 3 && path[0] === 'product' && path[1] === 'unit' && path[2] === 'siglas') {
    const nested = root.include?.find(item => item.association === 'unit');
    if (nested) addWhere(nested, { siglas: condition });
  } else if (root && path.length === 3 && path[0] === 'product' && path[1] === 'category' && path[2] === 'name') {
    const nested = root.include?.find(item => item.association === 'category');
    if (nested) addWhere(nested, { name: condition });
  } else if (root && path.length === 2 && path[0] === 'storage' && path[1] === 'name') {
    addWhere(root, { name: condition });
  }
  return options;
}

module.exports = { buildPhysicalKardexOrder, applyPhysicalKardexSearch, normalizePhysicalCategoryIds };

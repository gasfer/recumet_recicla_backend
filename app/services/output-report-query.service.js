'use strict';

const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const SEARCH_FIELDS = Object.freeze({
  cod: null,
  number_registry: null,
  comments: null,
  'client.full_names': 'client',
  'scale.name': 'scale',
  'user.full_names': 'user',
});

const SORT_FIELDS = new Set([
  'id', 'cod', 'voucher', 'date_output', 'type_registry', 'number_registry',
  'comments', 'type_output', 'total', 'total_quantity',
]);
const ASSOCIATION_SORTS = new Set(['client.full_names', 'scale.name', 'user.full_names']);

function buildOutputSearch(params = {}) {
  const field = String(params.type || '').trim();
  const query = String(params.query || '').trim();
  if (!query || !Object.prototype.hasOwnProperty.call(SEARCH_FIELDS, field)) return null;

  const column = field.split('.').pop();
  const condition = !Number.isNaN(Number(query))
    ? { [column]: { [Op.eq]: query } }
    : { [column]: { [Op.iLike]: `%${query}%` } };

  return { association: SEARCH_FIELDS[field], condition };
}

function buildOutputWhere(params = {}, dateColumn = '"Output"."date_output"') {
  const whereDate = whereDateForType(params.filterBy, params.date1, params.date2, dateColumn);
  const conditions = [
    params.id_sucursal ? { id_sucursal: params.id_sucursal } : {},
    params.id_storage ? { id_storage: params.id_storage } : {},
    params.type_pay ? { type_output: params.type_pay } : {},
    params.type_output ? { voucher: params.type_output } : {},
    params.type_registry ? { type_registry: params.type_registry } : {},
    params.id_client ? { id_client: params.id_client } : {},
    params.status ? { status: params.status } : {},
    { date_output: whereDate },
  ];

  const search = buildOutputSearch(params);
  if (search && !search.association) conditions.push(search.condition);
  return { [Op.and]: conditions };
}

function outputOrder(params = {}) {
  const raw = params.orderNew;
  if (!Array.isArray(raw) || raw.length < 2) return { order: [['id', 'DESC']] };

  const isAssociationSort = raw.length >= 3;
  const requestedField = isAssociationSort ? `${raw[0]}.${raw[1]}` : String(raw[0]);
  const direction = String(raw[raw.length - 1]).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  if (requestedField === 'total_quantity') return { order: [], sortByTotalQuantity: direction };
  if (isAssociationSort && ASSOCIATION_SORTS.has(requestedField)) {
    return { order: [[raw[0], raw[1], direction]] };
  }
  if (!isAssociationSort && SORT_FIELDS.has(requestedField)) {
    return { order: [[requestedField, direction]] };
  }
  return { order: [['id', 'DESC']] };
}

function outputListOrder(params = {}, sequelize) {
  const { order, sortByTotalQuantity } = outputOrder(params);
  if (!sortByTotalQuantity) return order;
  const quantityExpression = sequelize.literal(
    '(SELECT COALESCE(SUM("details_outputs"."quantity"), 0) FROM "details_outputs" WHERE "details_outputs"."id_output" = "Output"."id")'
  );
  return [[quantityExpression, sortByTotalQuantity], ['id', 'DESC']];
}

function sortOutputQuantities(rows, direction) {
  if (!direction) return rows;
  return rows.sort((left, right) => {
    const difference = Number(left.total_quantity) - Number(right.total_quantity);
    return direction === 'ASC' ? difference : -difference;
  });
}

module.exports = { buildOutputSearch, buildOutputWhere, outputOrder, outputListOrder, sortOutputQuantities };

'use strict';

const { Op } = require('sequelize');
const db = require('../database/config');
const { buildValuedKardexDto, classifySource } = require('./valued-kardex-contract.service');

const valuesOf = (row) => row?.dataValues || row;
const uniqueIntegers = (values) => [...new Set(values.map(Number).filter(Number.isInteger))];
const locationKey = (row) => [
  classifySource(row), Number(row.id_movement), Number(row.id_product),
  Number(row.id_sucursal), Number(row.id_storage), row.type,
].join(':');

const fetchDocuments = async (rows, models) => {
  const groups = new Map();
  for (const row of rows) {
    const type = row.type_movement;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(Number(row.id_movement));
  }
  const queries = [];
  const push = (type, model, attributes) => {
    const ids = uniqueIntegers(groups.get(type) || []);
    if (ids.length && model) queries.push(model.findAll({ where: { id: { [Op.in]: ids } }, attributes, raw: true }).then((data) => [type, data]));
  };
  push('INPUT', models.Input, ['id', 'id_user']);
  push('OUTPUT', models.Output, ['id', 'id_user']);
  push('CLASIFIED', models.Classified, ['id', 'id_user']);
  push('TRANSFER', models.Transfers, ['id', 'id_user_send', 'id_user_received']);
  push('KMOVEMENT', models.kardexMovements, ['id', 'id_user']);
  return new Map(await Promise.all(queries));
};

const actorIdFor = (row, documents) => {
  const document = (documents.get(row.type_movement) || []).find(({ id }) => Number(id) === Number(row.id_movement));
  if (!document) return null;
  if (row.type_movement === 'TRANSFER') return row.type === 'INPUT' ? document.id_user_received : document.id_user_send;
  return document.id_user ?? null;
};

const enrichKardexHistory = async (sourceRows, models = db) => {
  const rows = sourceRows.map(valuesOf);
  const completeRows = rows.filter((row) => [row.id_movement, row.id_product, row.id_sucursal, row.id_storage].every((value) => value != null));
  let entries = [];
  let documents = new Map();
  if (completeRows.length) {
    const movementIds = uniqueIntegers(completeRows.map((row) => row.id_movement)).map(String);
    [entries, documents] = await Promise.all([
      models.ValuedKardexEntry.findAll({
        where: { source_id: { [Op.in]: movementIds } },
        attributes: [
          'id', 'source_type', 'source_id', 'id_product', 'id_sucursal', 'id_storage',
          'quantity_input', 'quantity_output', 'applied_unit_cost', 'input_value', 'output_value',
          'average_unit_cost_after', 'balance_value_after', 'valuation_status', 'valuation_reason', 'original_entry_id',
        ],
        raw: true,
      }),
      fetchDocuments(completeRows, models),
    ]);
  }
  const entryByKey = new Map(entries.map((entry) => [locationKey({
    ...entry,
    id_movement: entry.source_id,
    type: Number(entry.quantity_input) > 0 ? 'INPUT' : 'OUTPUT',
    type_movement: entry.source_type === 'TRANSFER_SENT' || entry.source_type === 'TRANSFER_RECEIVED' ? 'TRANSFER'
      : entry.source_type.startsWith('CLASSIFICATION_') ? 'CLASIFIED' : entry.source_type,
  }), entry]));
  const actorIds = uniqueIntegers(completeRows.map((row) => actorIdFor(row, documents)));
  const users = actorIds.length
    ? await models.User.findAll({ where: { id: { [Op.in]: actorIds } }, attributes: ['id', 'full_names'], raw: true })
    : [];
  const usersById = new Map(users.map((user) => [Number(user.id), user]));

  sourceRows.forEach((sourceRow) => {
    const row = valuesOf(sourceRow);
    const entry = entryByKey.get(locationKey(row));
    const actorId = actorIdFor(row, documents);
    const user = usersById.get(Number(actorId));
    const enriched = buildValuedKardexDto({
      ...row,
      ...(entry || {}),
      responsible_id: user?.id ?? null,
      responsible_name: user?.full_names ?? null,
      original_movement_id: entry?.original_entry_id ?? null,
    });
    row.valuation = enriched.valuation;
    row.responsible = enriched.responsible;
    row.original_movement = enriched.original_movement;
  });
  return sourceRows;
};

module.exports = { actorIdFor, enrichKardexHistory, locationKey };

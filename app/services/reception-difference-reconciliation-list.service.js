'use strict';

const { Op } = require('sequelize');
const { TOLERANCE_DECISIONS, isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');
const { Transfers, sequelize } = require('../database/config');
const historicalDifferenceService = require('./historical-transfer-difference.service');
const {
  HISTORICAL_DIFFERENCE_TYPES: TYPES,
  HISTORICAL_RECONCILIATION_STATUSES: STATUSES,
} = require('../constants/historical-transfer-difference');

const EPSILON = 0.0001;
const MAX_CANDIDATES = 1000;

const presentationStatus = (status) => {
  if (status === STATUSES.COMPLETE) return 'RESUELTA';
  if (status === STATUSES.PARTIAL) return 'PARCIAL';
  if (status === STATUSES.NOT_ATTRIBUTABLE || status === STATUSES.UNDETERMINED) return 'NO_ATRIBUIBLE';
  return 'PENDIENTE';
};

const normalizePage = (value) => Math.max(1, Number(value) || 1);
const normalizeLimit = (value) => Math.min(Math.max(1, Number(value) || 25), 100);

const matchesText = (row, query) => {
  if (!query) return true;
  const value = query.toLocaleLowerCase();
  return [row.transfer.cod, row.transfer.registry_number, row.item.product?.cod, row.item.product?.name]
    .filter(Boolean)
    .some((field) => String(field).toLocaleLowerCase().includes(value));
};

const matchesFilters = (row, filters) => (
  (!filters.status || row.status === filters.status)
  && (!filters.type || row.item.difference_type === filters.type)
  && matchesText(row, filters.query)
);

const toRow = (transfer, item) => ({
  transfer: {
    id: Number(transfer.id),
    cod: transfer.cod,
    registry_number: transfer.registry_number,
    date_received: transfer.date_received,
    id_sucursal_received: Number(transfer.id_sucursal_received),
    id_storage_received: Number(transfer.id_storage_received),
    sucursal_received: transfer.sucursal_received ? { id: Number(transfer.sucursal_received.id), name: transfer.sucursal_received.name } : null,
    storage_received: transfer.storage_received ? { id: Number(transfer.storage_received.id), name: transfer.storage_received.name } : null,
  },
  item,
  status: presentationStatus(item.reconciliation_status),
  technical_status: item.reconciliation_status,
  has_review_note: Boolean(item.difference_movements?.length || item.registered_product),
  action: item.allowed_action,
  message: item.message,
});

const groupRows = (rows) => [...rows.reduce((groups, row) => {
  const current = groups.get(row.transfer.id);
  if (current) {
    current.items.push(row);
    return groups;
  }
  groups.set(row.transfer.id, { transfer: row.transfer, items: [row] });
  return groups;
}, new Map()).values()].map((group) => ({
  ...group,
  summary: group.items.reduce((summary, row) => ({
    ...summary,
    [row.status.toLocaleLowerCase()]: summary[row.status.toLocaleLowerCase()] + 1,
  }), { pendiente: 0, parcial: 0, resuelta: 0, no_atribuible: 0 }),
}));

const list = async ({ idSucursal, idStorage, page, limit, status, type, query, dateFrom, dateTo }) => {
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);
  const where = {
    status: 'RECEIVED',
    ...(idSucursal ? { id_sucursal_received: Number(idSucursal) } : {}),
    ...(idStorage ? { id_storage_received: Number(idStorage) } : {}),
    ...(dateFrom || dateTo ? {
      date_received: {
        ...(dateFrom ? { [Op.gte]: new Date(dateFrom) } : {}),
        ...(dateTo ? { [Op.lte]: new Date(`${dateTo}T23:59:59.999`) } : {}),
      },
    } : {}),
  };
  const transfers = await Transfers.findAll({
    attributes: ['id', 'cod', 'registry_number', 'date_received', 'id_sucursal_received', 'id_storage_received'],
    where,
    include: [
      { association: 'sucursal_received', attributes: ['id', 'name'] },
      { association: 'storage_received', attributes: ['id', 'name'] },
      {
        association: 'detailsTransfers', required: true, attributes: [],
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.fn('ABS', sequelize.literal('"detailsTransfers"."quantity" - "detailsTransfers"."quantity_received"')),
              { [Op.gt]: EPSILON },
            ),
            {
              [Op.or]: [
                { tolerance_decision: { [Op.ne]: TOLERANCE_DECISIONS.ACCEPTED } },
                { tolerance_decision: null },
              ],
            },
          ],
        },
      },
    ],
    order: [['date_received', 'DESC'], ['id', 'DESC']],
    limit: MAX_CANDIDATES,
    subQuery: false,
  });
  const projections = await Promise.all(transfers.map(async (transfer) => ({
    transfer: transfer.toJSON(),
    projection: await historicalDifferenceService.getProjection(Number(transfer.id)),
  })));
  const rows = projections.flatMap(({ transfer, projection }) => projection.items
    .filter(({ difference_type, tolerance_decision }) =>
      (difference_type === TYPES.SURPLUS || difference_type === TYPES.SHORTAGE)
      && !isAcceptedToleranceDecision(tolerance_decision)
    )
    .map((item) => toRow(transfer, item)))
    .filter((row) => matchesFilters(row, { status, type, query: String(query || '').trim() }));
  const groups = groupRows(rows);
  const offset = (normalizedPage - 1) * normalizedLimit;
  return {
    data: groups.slice(offset, offset + normalizedLimit),
    total: groups.length,
    page: normalizedPage,
    limit: normalizedLimit,
    summary: rows.reduce((summary, row) => ({
      ...summary,
      [row.status.toLocaleLowerCase()]: summary[row.status.toLocaleLowerCase()] + 1,
    }), { pendiente: 0, parcial: 0, resuelta: 0, no_atribuible: 0, total: rows.length }),
  };
};

module.exports = { list, presentationStatus, matchesFilters };

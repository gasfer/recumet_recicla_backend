const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const REPORT_SORT_FIELDS = new Set(['id', 'cod', 'date_voucher', 'type_registry', 'registry_number', 'total', 'type']);
const REPORT_STATUS = new Set(['ACTIVE', 'INACTIVE']);
const REPORT_PAYMENT_TYPES = new Set(['', 'CONTADO', 'CREDITO']);

const parseIds = (value) => String(value || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);

const normalizePurchaseReportFilters = (params = {}) => {
    const filterBy = ['DAY', 'MONTH', 'YEAR', 'RANGE'].includes(params.filterBy) ? params.filterBy : 'MONTH';
    const fieldSort = REPORT_SORT_FIELDS.has(params.field_sort) ? params.field_sort : 'date_voucher';
    return {
        filterBy,
        date1: String(params.date1 || ''),
        date2: String(params.date2 || ''),
        sucursalIds: parseIds(params.id_sucursal),
        storageIds: parseIds(params.id_storage),
        categoryIds: parseIds(params.category_ids),
        productIds: parseIds(params.id_products),
        status: REPORT_STATUS.has(params.status) ? params.status : 'ACTIVE',
        typePay: REPORT_PAYMENT_TYPES.has(params.type_pay) ? params.type_pay : '',
        searchType: String(params.type || ''),
        query: String(params.query || ''),
        fieldSort,
        direction: String(params.order || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    };
};

const buildPurchaseReportWhere = (filters, column = '"Input"."date_voucher"') => ({
    [Op.and]: [
        filters.sucursalIds.length ? { id_sucursal: { [Op.in]: filters.sucursalIds } } : {},
        filters.storageIds.length ? { id_storage: { [Op.in]: filters.storageIds } } : {},
        filters.typePay ? { type: filters.typePay } : {},
        { status: filters.status },
        { date_voucher: whereDateForType(filters.filterBy, filters.date1, filters.date2, column) },
    ],
});

module.exports = { normalizePurchaseReportFilters, buildPurchaseReportWhere, parseIds };

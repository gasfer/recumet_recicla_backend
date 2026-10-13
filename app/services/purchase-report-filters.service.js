const { Op } = require('sequelize');
const moment = require('moment');

const REPORT_SORT_FIELDS = new Set(['id', 'cod', 'date_voucher', 'type_registry', 'registry_number', 'total', 'type']);
const REPORT_STATUS = new Set(['ACTIVE', 'INACTIVE']);
const REPORT_PAYMENT_TYPES = new Set(['', 'CONTADO', 'CREDITO']);

const parseIds = (value) => String(value || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);

const normalizePurchaseReportFilters = (params = {}) => {
    const filterBy = ['DAY', 'MONTH', 'YEAR', 'RANGE'].includes(params.filterBy) ? params.filterBy : 'MONTH';
    const fieldSort = REPORT_SORT_FIELDS.has(params.field_sort) ? params.field_sort : 'date_voucher';
    return {
        providerId: params.id_provider || '',
        providerTypeId: params.id_type_provider || '',
        registryType: params.type_registry || '',
        referralSources: params.referral_sources || '',
        oldCustomer: params.old_customer === true || params.old_customer === 'true' ? true : params.old_customer === false || params.old_customer === 'false' ? false : undefined,
        withPickup: params.with_pickup === true || params.with_pickup === 'true' ? true : params.with_pickup === false || params.with_pickup === 'false' ? false : undefined,
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

const buildPurchaseReportWhere = (filters) => ({
    [Op.and]: [
        filters.sucursalIds.length ? { id_sucursal: { [Op.in]: filters.sucursalIds } } : {},
        filters.storageIds.length ? { id_storage: { [Op.in]: filters.storageIds } } : {},
        filters.typePay ? { type: filters.typePay } : {},
        filters.providerId ? { id_provider: filters.providerId } : {},
        filters.registryType ? { type_registry: filters.registryType } : {},
        filters.referralSources ? { referral_sources: filters.referralSources } : {},
        filters.oldCustomer !== undefined ? { old_customer: filters.oldCustomer } : {},
        filters.withPickup !== undefined ? { with_pickup: filters.withPickup } : {},
        { status: filters.status },
        dateRangeFilter(filters),
    ],
});

const dateRangeFilter = (filters) => {
    let start;
    let end;
    if (filters.filterBy === 'MONTH') {
        start = moment(`${filters.date2}-${filters.date1}-01`, 'YYYY-MM-DD', true);
        if (start.isValid()) end = start.clone().add(1, 'month');
    } else if (filters.filterBy === 'YEAR') {
        start = moment(`${filters.date1}-01-01`, 'YYYY-MM-DD', true);
        if (start.isValid()) end = start.clone().add(1, 'year');
    } else if (filters.filterBy === 'DAY' || filters.filterBy === 'RANGE') {
        start = moment(filters.date1, 'DD-MM-YYYY', true);
        const lastDate = moment(filters.filterBy === 'RANGE' ? (filters.date2 || filters.date1) : filters.date1, 'DD-MM-YYYY', true);
        if (start.isValid() && lastDate.isValid() && !start.isAfter(lastDate, 'day')) {
            start.startOf('day');
            end = lastDate.add(1, 'day').startOf('day');
        }
    }
    if (!start?.isValid() || !end?.isValid()) {
        throw Object.assign(new Error('Seleccione un período válido para el reporte de compras.'), { statusCode: 400 });
    }
    return { date_voucher: { [Op.gte]: start.toDate(), [Op.lt]: end.toDate() } };
};

module.exports = { normalizePurchaseReportFilters, buildPurchaseReportWhere, parseIds, dateRangeFilter };

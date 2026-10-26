const { providerCommercialFilter } = require('./provider-commercial-filter');
const { Input, sequelize } = require('../database/config');
const { Op } = require('sequelize');
const moment = require('moment');
const { normalizePurchaseReportFilters, buildPurchaseReportWhere } = require('./purchase-report-filters.service');

const REPORT_EXPORT_INPUT_ATTRIBUTES = [
    'id', 'cod', 'date_voucher', 'type', 'type_registry', 'registry_number', 'total',
    'referral_sources', 'old_customer', 'with_pickup', 'id_provider',
];
const REPORT_PAGE_INPUT_ATTRIBUTES = [
    ...REPORT_EXPORT_INPUT_ATTRIBUTES, 'createdAt', 'type_payment', 'account_input',
    'comments', 'payment_voucher', 'sumas', 'discount',
];

const includesForReport = (filters, { includeDetailModal = false } = {}) => [
    { association: 'provider', attributes: ['full_names', 'id_type_provider', ...(includeDetailModal ? ['number_document'] : [])], ...(filters.providerTypeId || filters.providerCommercialUserId ? { where: { ...providerCommercialFilter(filters.providerCommercialUserId, filters.entityType), ...(filters.providerTypeId ? { id_type_provider: filters.providerTypeId } : {}) }, required: true } : {}), include: [{ association: 'type', attributes: ['name'] }] },
    { association: 'sucursal', attributes: ['name'] },
    { association: 'storage', attributes: ['name'] },
    {
        association: 'detailsInput', attributes: ['quantity', 'total', 'cost'], where: { status: 'ACTIVE', removed_at: null },
        required: false,
        include: [{
            association: 'product', attributes: ['id', 'cod', 'name', ...(includeDetailModal ? ['description'] : [])],
            where: {
                ...(filters.categoryIds.length ? { id_category: { [require('sequelize').Op.in]: filters.categoryIds } } : {}),
                ...(filters.productIds.length ? { id: { [require('sequelize').Op.in]: filters.productIds } } : {}),
            },
            required: filters.categoryIds.length > 0 || filters.productIds.length > 0,
            include: [{ association: 'unit', attributes: ['id', 'siglas'] }],
        }],
    },
    ...(includeDetailModal ? [
        { association: 'bank', attributes: ['name'], required: false },
        { association: 'scale', attributes: ['name'], required: false },
        { association: 'user', attributes: ['full_names', 'number_document'], required: false },
    ] : []),
];

const addTotalQuantity = (inputs) => inputs.map((input) => {
    const kgDetails = (input.detailsInput || []).filter((item) => ['KG', 'KGR', 'KILO', 'KILOGRAMO', 'KILOGRAMOS'].includes(String(item.product?.unit?.siglas || '').trim().toUpperCase()));
    const kgQuantity = kgDetails.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const kgAmount = kgDetails.reduce((sum, item) => sum + Number(item.total ?? Number(item.quantity || 0) * Number(item.cost || 0)), 0);
    input.dataValues.total_quantity = (input.detailsInput || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    input.dataValues.kg_quantity = kgQuantity;
    input.dataValues.kg_total = kgAmount;
    input.dataValues.kg_purchase_price = kgQuantity ? kgAmount / kgQuantity : null;
    return input;
});

const queryPurchaseReportTotals = async (params) => {
    const filters = normalizePurchaseReportFilters(params);
    const options = applyDetailFilter(applyReportSearch({
        where: buildPurchaseReportWhere(filters),
        include: filters.providerTypeId || filters.providerCommercialUserId || (filters.searchType === 'provider.full_names' && filters.query)
            ? [{ association: 'provider', attributes: ['id'], required: true,
                where: { ...providerCommercialFilter(filters.providerCommercialUserId, filters.entityType), ...(filters.providerTypeId ? { id_type_provider: filters.providerTypeId } : {}),
                    ...(filters.searchType === 'provider.full_names' && filters.query ? { full_names: { [Op.iLike]: `%${filters.query}%` } } : {}) } }]
            : [],
    }, filters), filters);
    const inputs = await Input.findAll({
        where: options.where,
        attributes: ['id', 'total'],
        include: [...options.include, {
            association: 'detailsInput', attributes: ['quantity', 'total', 'cost'],
            where: { status: 'ACTIVE', removed_at: null }, required: false,
            include: [{ association: 'product', attributes: ['id'], include: [{ association: 'unit', attributes: ['siglas'] }] }],
        }],
    });
    const totals = inputs.reduce((result, input) => {
        result.total_amount += Number(input.total || 0);
        for (const detail of input.detailsInput || []) {
            if (!['KG', 'KGR', 'KILO', 'KILOGRAMO', 'KILOGRAMOS'].includes(String(detail.product?.unit?.siglas || '').trim().toUpperCase())) continue;
            const quantity = Number(detail.quantity || 0);
            result.kg_quantity += quantity;
            result.kg_total += Number(detail.total ?? quantity * Number(detail.cost || 0));
        }
        return result;
    }, { total_amount: 0, kg_quantity: 0, kg_total: 0 });
    totals.kg_purchase_price = totals.kg_quantity ? totals.kg_total / totals.kg_quantity : null;
    return totals;
};

const addPurchaseReportTotals = (inputs, totals) => ({ ...inputs, totals });

const applyReportSearch = (options, filters) => {
    if (!filters.searchType || !filters.query) return options;
    if (filters.searchType === 'provider.full_names') {
        const provider = options.include.find((item) => item.association === 'provider');
        provider.where = { ...provider.where, full_names: { [Op.iLike]: `%${filters.query}%` } };
        provider.required = true;
        return options;
    }
    if (filters.searchType === 'scale.name' || filters.searchType === 'user.full_names') {
        const [association, field] = filters.searchType.split('.');
        let related = options.include.find(item => item.association === association);
        if (!related) { related = { association, attributes: [] }; options.include.push(related); }
        related.required = true;
        related.where = { ...related.where, [field]: { [Op.iLike]: `%${filters.query}%` } };
        return options;
    }
    const allowed = new Set(['cod', 'registry_number', 'type_registry', 'comments']);
    if (allowed.has(filters.searchType)) {
        options.where[Op.and].push({ [filters.searchType]: { [Op.iLike]: `%${filters.query}%` } });
    }
    return options;
};

const applyDetailFilter = (options, filters) => {
    if (!filters.categoryIds.length && !filters.productIds.length) return options;
    const categories = filters.categoryIds.length ? ` AND product.id_category IN (${filters.categoryIds.join(',')})` : '';
    const products = filters.productIds.length ? ` AND detail.id_product IN (${filters.productIds.join(',')})` : '';
    options.where[Op.and].push({ id: { [Op.in]: sequelize.literal(`(
        SELECT detail.id_input FROM details_inputs AS detail
        JOIN products AS product ON product.id = detail.id_product
        WHERE detail.status = 'ACTIVE' AND detail.removed_at IS NULL${categories}${products}
    )`) } });
    return options;
};

const queryPurchaseReportPage = async (params) => {
    const filters = normalizePurchaseReportFilters(params);
    const options = applyDetailFilter(applyReportSearch({
        where: buildPurchaseReportWhere(filters),
        include: filters.providerTypeId || filters.providerCommercialUserId || (filters.searchType === 'provider.full_names' && filters.query)
            ? [{ association: 'provider', attributes: ['id', 'id_type_provider'], required: true,
                where: { ...providerCommercialFilter(filters.providerCommercialUserId, filters.entityType), ...(filters.providerTypeId ? { id_type_provider: filters.providerTypeId } : {}),
                    ...(filters.searchType === 'provider.full_names' && filters.query ? { full_names: { [Op.iLike]: `%${filters.query}%` } } : {}) } }]
            : [],
    }, filters), filters);
    const page = Math.max(1, Number.parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Number.parseInt(params.limit, 10) || 100);
    const order = [[filters.fieldSort, filters.direction], ['id', 'DESC']];
    const [count, pageIds] = await Promise.all([
        Input.count({ where: options.where, include: options.include, distinct: true, col: 'id' }),
        Input.findAll({ where: options.where, include: options.include, attributes: ['id'], order,
            limit, offset: (page - 1) * limit, subQuery: false, raw: true }),
    ]);
    const ids = pageIds.map((row) => row.id);
    const rows = ids.length ? await Input.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: REPORT_PAGE_INPUT_ATTRIBUTES,
        order,
        include: includesForReport(filters, { includeDetailModal: true }),
    }) : [];
    return {
        previousPage: page > 1 ? page - 1 : null,
        currentPage: page,
        nextPage: page * limit < count ? page + 1 : null,
        total: count,
        total_all: count,
        per_page: limit,
        from: count ? (page - 1) * limit + 1 : 0,
        to: Math.min(page * limit, count),
        totals: addPurchaseReportTotals({}, await queryPurchaseReportTotals(params)).totals,
        data: addTotalQuantity(rows),
    };
};

const queryPurchaseReportExport = async (params) => {
    const filters = normalizePurchaseReportFilters(params);
    const options = applyDetailFilter(applyReportSearch({
        where: buildPurchaseReportWhere(filters),
        order: [['id_provider', 'ASC'], ['date_voucher', 'DESC'], [filters.fieldSort, filters.direction]],
        attributes: REPORT_EXPORT_INPUT_ATTRIBUTES,
        include: includesForReport(filters),
    }, filters), filters);
    const inputs = await Input.findAll(options);
    return addTotalQuantity(inputs);
};

const summarizeByProduct = (inputs) => {
    const rows = new Map();
    inputs.forEach((input) => {
        (input.detailsInput || []).forEach((detail) => {
            const product = detail.product;
            if (!product) return;
            const id = product.id;
            const current = rows.get(id) || { cod: product.cod, name: product.name, quantity: 0, total: 0 };
            current.quantity += Number(detail.quantity || 0);
            current.total += Number(detail.total || 0);
            rows.set(id, current);
        });
    });
    return [...rows.values()];
};

module.exports = { queryPurchaseReportPage, queryPurchaseReportTotals, addPurchaseReportTotals, queryPurchaseReportExport, summarizeByProduct, normalizePurchaseReportFilters };

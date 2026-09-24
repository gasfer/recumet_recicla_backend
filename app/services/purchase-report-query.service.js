const { Input, sequelize } = require('../database/config');
const { Op } = require('sequelize');
const { normalizePurchaseReportFilters, buildPurchaseReportWhere } = require('./purchase-report-filters.service');

const includesForReport = (filters) => [
    { association: 'provider', attributes: ['full_names'], include: [{ association: 'type', attributes: ['name'] }] },
    { association: 'sucursal', attributes: ['name'] },
    { association: 'storage', attributes: ['name'] },
    {
        association: 'detailsInput', attributes: ['quantity', 'total'], where: { status: 'ACTIVE' },
        required: false,
        include: [{
            association: 'product', attributes: ['cod', 'name'],
            where: {
                ...(filters.categoryIds.length ? { id_category: { [require('sequelize').Op.in]: filters.categoryIds } } : {}),
                ...(filters.productIds.length ? { id: { [require('sequelize').Op.in]: filters.productIds } } : {}),
            },
            required: filters.categoryIds.length > 0 || filters.productIds.length > 0,
            include: [{ association: 'unit', attributes: ['siglas'] }],
        }],
    },
];

const addTotalQuantity = (inputs) => inputs.map((input) => {
    input.dataValues.total_quantity = (input.detailsInput || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return input;
});

const applyReportSearch = (options, filters) => {
    if (!filters.searchType || !filters.query) return options;
    if (filters.searchType === 'provider.full_names') {
        const provider = options.include.find((item) => item.association === 'provider');
        provider.where = { full_names: { [Op.iLike]: `%${filters.query}%` } };
        provider.required = true;
        return options;
    }
    const allowed = new Set(['cod', 'registry_number', 'type_registry']);
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
        WHERE detail.status = 'ACTIVE'${categories}${products}
    )`) } });
    return options;
};

const queryPurchaseReportPage = async (params) => {
    const filters = normalizePurchaseReportFilters(params);
    const options = applyDetailFilter(applyReportSearch({
        where: buildPurchaseReportWhere(filters),
        order: [[filters.fieldSort, filters.direction]],
        include: includesForReport(filters),
    }, filters), filters);
    const page = Math.max(1, Number.parseInt(params.page, 10) || 1);
    const limit = Math.max(1, Number.parseInt(params.limit, 10) || 100);
    const { count, rows } = await Input.findAndCountAll({
        ...options,
        limit,
        offset: (page - 1) * limit,
        distinct: true,
    });
    return {
        previousPage: page > 1 ? page - 1 : null,
        currentPage: page,
        nextPage: page * limit < count ? page + 1 : null,
        total: count,
        total_all: count,
        per_page: limit,
        from: count ? (page - 1) * limit + 1 : 0,
        to: Math.min(page * limit, count),
        data: addTotalQuantity(rows),
    };
};

const queryPurchaseReportExport = async (params) => {
    const filters = normalizePurchaseReportFilters(params);
    const options = applyDetailFilter(applyReportSearch({
        where: buildPurchaseReportWhere(filters),
        order: [['id_provider', 'ASC'], ['date_voucher', 'DESC'], [filters.fieldSort, filters.direction]],
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

module.exports = { queryPurchaseReportPage, queryPurchaseReportExport, summarizeByProduct, normalizePurchaseReportFilters };

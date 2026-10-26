'use strict';

const { Op } = require('sequelize');
const { Input, Provider, AccountsPayable } = require('../database/config');

const parsePositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const numberValue = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const summarizePurchases = ({ inputs, accounts, sites }) => {
    const accountsByInput = new Map(accounts.map(account => [Number(account.id_input), account]));
    return {
        purchased_kg: inputs.reduce((sum, input) => sum + (input.total_kg || 0), 0),
        purchased_amount: inputs.reduce((sum, input) => sum + numberValue(input.total), 0),
        paid_amount: inputs.reduce((sum, input) => {
            const account = accountsByInput.get(Number(input.id));
            return sum + (account ? numberValue(account.monto_abonado) : input.type === 'CONTADO' ? numberValue(input.total) : 0);
        }, 0),
        pending_amount: inputs.reduce((sum, input) => {
            const account = accountsByInput.get(Number(input.id));
            return sum + (account ? numberValue(account.monto_restante) : input.type === 'CREDITO' ? numberValue(input.total) : 0);
        }, 0),
        purchase_count: inputs.length,
        active_sites: sites.length,
    };
};

const getProviderPurchaseHistory = async ({ providerId, siteId, page = 1, limit = 25 }) => {
    const provider = await Provider.findByPk(providerId, {
        attributes: ['id', 'id_provider_company'],
    });
    if (!provider) {
        throw Object.assign(new Error('No se encontró el proveedor solicitado.'), { statusCode: 404 });
    }

    const sites = provider.id_provider_company
        ? (await Provider.findAll({
            where: { id_provider_company: provider.id_provider_company, status: true },
            attributes: ['id', 'full_names', 'site_role'],
            raw: true,
        }))
        : [{ id: provider.id }];
    const siteIds = sites.map(({ id }) => Number(id));
    if (siteId && (!Number.isSafeInteger(Number(siteId)) || !siteIds.includes(Number(siteId)))) {
        throw Object.assign(new Error('La sede seleccionada no pertenece a esta empresa o está inactiva.'), { statusCode: 404 });
    }
    const selectedSiteIds = siteId ? [Number(siteId)] : siteIds;
    const where = { id_provider: { [Op.in]: selectedSiteIds }, status: 'ACTIVE' };
    const currentPage = parsePositiveInteger(page, 1);
    const perPage = Math.min(parsePositiveInteger(limit, 25), 50);
    const offset = (currentPage - 1) * perPage;

    const [total, totalAmount, lastPurchaseDate, result, activeInputs, payableAccounts] = await Promise.all([
        Input.count({ where }),
        Input.sum('total', { where }),
        Input.max('date_voucher', { where }),
        Input.findAndCountAll({
            where,
            attributes: [
                'id', 'cod', 'date_voucher', 'type', 'type_registry', 'registry_number',
                'total', 'status', 'id_provider', 'id_sucursal', 'id_user', 'createdAt', 'type',
            ],
            include: [
                { association: 'user', attributes: ['full_names'], required: false },
                { association: 'sucursal', attributes: ['name'], required: false },
                { association: 'provider', attributes: ['id', 'full_names', 'site_role'], required: false },
                {
                    association: 'detailsInput',
                    attributes: ['quantity', 'total'],
                    where: { status: 'ACTIVE' },
                    required: false,
                    include: [{
                        association: 'product',
                        attributes: ['id'],
                        required: false,
                        include: [{ association: 'unit', attributes: ['siglas'], required: false }],
                    }],
                },
            ],
            order: [['date_voucher', 'DESC'], ['id', 'DESC']],
            limit: perPage,
            offset,
            distinct: true,
        }),
        Input.findAll({
            where,
            attributes: ['id', 'total', 'type'],
            include: [{ association: 'detailsInput', attributes: ['quantity'], where: { status: 'ACTIVE' }, required: false, include: [{ association: 'product', attributes: ['id'], required: false, include: [{ association: 'unit', attributes: ['siglas'], required: false }] }] }],
        }),
        AccountsPayable.findAll({
            where: { id_provider: { [Op.in]: selectedSiteIds }, status: true, status_account: { [Op.ne]: 'ANULADO' } },
            attributes: ['id_input', 'monto_abonado', 'monto_restante'],
            raw: true,
        }),
    ]);

    const data = result.rows.map((input) => {
        const purchase = input.toJSON();
        const totalKg = (purchase.detailsInput || []).reduce((sum, detail) => {
            const unit = String(detail.product?.unit?.siglas || '').trim().toUpperCase();
            return ['KG', 'KGR', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(unit)
                ? sum + Number(detail.quantity || 0)
                : sum;
        }, 0);
        delete purchase.detailsInput;
        const cost = numberValue(purchase.total);
        return { ...purchase, total_kg: totalKg, average_cost_per_kg: totalKg > 0 ? cost / totalKg : 0, cost };
    });

    const activeInputRows = activeInputs.map(input => {
        const item = input.toJSON();
        const totalKg = (item.detailsInput || []).reduce((sum, detail) => {
            const unit = String(detail.product?.unit?.siglas || '').trim().toUpperCase();
            return ['KG', 'KGR', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(unit) ? sum + numberValue(detail.quantity) : sum;
        }, 0);
        return { ...item, total_kg: totalKg };
    });
    return {
        data,
        total,
        current_page: currentPage,
        per_page: perPage,
        next_page: currentPage * perPage < total ? currentPage + 1 : null,
        previous_page: currentPage > 1 ? currentPage - 1 : null,
        summary: {
            total_count: total,
            total_amount: Number(totalAmount || 0),
            last_purchase_date: lastPurchaseDate || null,
            ...summarizePurchases({ inputs: activeInputRows, accounts: payableAccounts, sites: siteId ? sites.filter(site => Number(site.id) === Number(siteId)) : sites }),
        },
        sites: sites.map(site => ({ id: Number(site.id), name: site.full_names, site_role: site.site_role })),
        selected_site_id: siteId ? Number(siteId) : null,
    };
};

module.exports = { getProviderPurchaseHistory, summarizePurchases };

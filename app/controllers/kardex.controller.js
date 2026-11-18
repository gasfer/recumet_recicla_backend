const { stockProviderCondition } = require('../services/stock-provider-filter.service');
const { response, request } = require('express');
const { sequelize, ViewKardex, TransferReviewNote, Transfers, kardexMovements } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const { attachAvailabilityToKardexRows, getStockDiagnostic } = require('../services/stock-availability.service');
const { sendPermissionDenied } = require('../helpers/permission-denied');
const { KARDEX_HISTORY_ATTRIBUTES, attachKardexEventMetadata } = require('../services/kardex-event.service');
const { enrichKardexHistory } = require('../services/kardex-history-enrichment.service');
const { getDailyKardexHistory } = require('../services/daily-kardex-history.service');
const { buildPhysicalKardexOrder, applyPhysicalKardexSearch, normalizePhysicalCategoryIds } = require('../services/physical-kardex-query.service');
const { summarizePhysicalKardex, formatUnitTotals } = require('../helpers/physical-kardex-quantity-totals');
const { getNumberDecimal } = require('../helpers/company');
const { exactAdd } = require('../helpers/number-formatter');
const { unitLabel, addUnitQuantity, formatUnitTotals: formatStockUnitTotals, normalizeStockOrder } = require('../helpers/stock-unit-totals');

const canAccessSucursal = (user, idSucursal) => user?.role === 'ADMINISTRADOR' || (
    Boolean(idSucursal) && (user?.assign_sucursales || []).some(({ id_sucursal, status }) => status !== false && Number(id_sucursal) === Number(idSucursal))
);

const normalizeKardexHistoryOrder = (fieldSort, order) => {
    const requestedField = String(fieldSort || 'date');
    const requestedDirection = String(order || 'DESC').toUpperCase();
    const allowedFields = new Set([
        'id', 'date', 'registry_number', 'detail', 'quantity_input', 'quantity_output', 'saldo',
        'product.cod', 'product.name', 'product.unit.siglas',
    ]);
    if (!allowedFields.has(requestedField) || !['ASC', 'DESC'].includes(requestedDirection)) {
        return ['date', 'DESC'];
    }
    return [...requestedField.split('.'), requestedDirection];
};

const getKardexPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2, type_kardex, field_sort, order } = req.query;
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');
        const historyOrder = normalizeKardexHistoryOrder(field_sort, order);
        const tieBreakerOrder = historyOrder.at(-1).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        const optionsDb = {
            order: [historyOrder, ['id', tieBreakerOrder]],
            attributes: [...KARDEX_HISTORY_ATTRIBUTES],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage ? { id_storage } : {},
                    id_product ? { id_product } : {},
                    type_kardex ? { type: type_kardex } : {},
                    { date: whereDate },
                ]
            },
            include: [
                { association: 'sucursal', attributes: ['name', 'city'] },
                { association: 'storage', attributes: ['name'] },
                {
                    association: 'product', attributes: { exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt'] },
                    include: [{ association: 'unit', attributes: ['name', 'siglas'] }]
                },
            ]
        };
        let kardexes = await paginate(ViewKardex, page, limit, type, query, optionsDb);
        kardexes.data.forEach(attachKardexEventMetadata);
        await enrichKardexHistory(kardexes.data);
        const transferMovements = kardexes.data.filter((item) => item.type_movement === 'KMOVEMENT');
        const movementIds = transferMovements.map((item) => Number(item.id_movement)).filter(Number.isInteger);
        if (movementIds.length > 0) {
            const transferCodes = [...new Set(transferMovements
                .map((item) => `${item.detail || ''} ${item.sub_detail || ''}`.match(/\bTRAS\d+\b/i)?.[0])
                .filter(Boolean))];
            const [notes, sourceMovements, transfers] = await Promise.all([
                TransferReviewNote.findAll({
                    where: { id_kardex_movement: { [Op.in]: movementIds } },
                    attributes: ['id', 'registry_number', 'type', 'id_kardex_movement'],
                }),
                kardexMovements.findAll({
                    where: { id: { [Op.in]: movementIds } },
                    attributes: ['id', 'source_type', 'source_id', 'source_detail_id', 'effect_type'],
                    raw: true,
                }),
                transferCodes.length
                    ? Transfers.findAll({ where: { cod: { [Op.in]: transferCodes } }, attributes: ['id', 'cod'], raw: true })
                    : Promise.resolve([]),
            ]);
            const notesByMovement = new Map(notes.map((note) => [Number(note.id_kardex_movement), note]));
            const sourcesByMovement = new Map(sourceMovements.map((movement) => [Number(movement.id), movement]));
            const transferIdsByCode = new Map(transfers.map((transfer) => [String(transfer.cod).toUpperCase(), transfer.id]));
            transferMovements.forEach((item) => {
                const movement = sourcesByMovement.get(Number(item.id_movement));
                const note = notesByMovement.get(Number(item.id_movement));
                if (movement) {
                    item.dataValues.source_type = movement.source_type;
                    item.dataValues.source_id = movement.source_id;
                    item.dataValues.source_detail_id = movement.source_detail_id;
                    item.dataValues.effect_type = movement.effect_type;
                    if (['TRANSFER_RECEPTION', 'TRANSFER_RECEPTION_CANCELLATION', 'TRANSFER_CANCELLATION'].includes(movement.source_type)
                        && /^\d+$/.test(String(movement.source_id || ''))) {
                        item.dataValues.source_transfer_id = Number(String(movement.source_id).split(':R:')[0]);
                    }
                }
                const transferCode = `${item.detail || ''} ${item.sub_detail || ''}`.match(/\bTRAS\d+\b/i)?.[0];
                if (!item.dataValues.source_transfer_id && transferCode) {
                    item.dataValues.source_transfer_id = transferIdsByCode.get(transferCode.toUpperCase()) || null;
                }
                if (note) item.dataValues.review_note = note;
            });
        }
        return res.status(200).json({
            ok: true,
            kardexes,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
};

const getDailyKardexPaginate = async (req = request, res = response) => {
    try {
        const { page, limit, date1, id_sucursal, id_storage, id_product, type, query, type_kardex, field_sort, order } = req.query;
        const result = await getDailyKardexHistory({
            date: date1,
            idSucursal: id_sucursal,
            idStorage: id_storage,
            idProduct: id_product || null,
            type: type || type_kardex || '',
            query: query || '',
            fieldSort: field_sort || 'date',
            order: order || 'DESC',
            page,
            limit,
        });
        result.data.forEach(attachKardexEventMetadata);
        await enrichKardexHistory(result.data);
        return res.status(200).json({ ok: true, kardexes: { data: result.data, total: result.total, currentPage: Number(page) || 1, per_page: Number(limit) || 50 } });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }] });
    }
};

const getKardexFisicoPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2, category_ids, category_types, field_sort, order } = req.query;
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');

        const categoryIds = normalizePhysicalCategoryIds(category_ids);
        const whereProduct = categoryIds.length ? { id_category: { [Op.in]: categoryIds } } : {};

        let whereCategory = {};
        if (category_types) {
            let types = category_types;
            if (!Array.isArray(category_types)) {
                types = [category_types];
            }
            if (types.length > 0) {
                whereCategory = {
                    type: {
                        [Op.in]: types
                    }
                };
            }
        }

        const optionsDbAll = {
            order: buildPhysicalKardexOrder(field_sort, order),
            attributes: [
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage ? { id_storage } : {},
                    id_product ? { id_product } : {},
                    { date: whereDate },
                ]
            },
            include: [
                {
                    association: 'product', attributes: { exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt'] },
                    where: whereProduct,
                    include: [
                        { association: 'unit', attributes: ['name', 'siglas'] },
                        { association: 'category', attributes: ['name'], where: whereCategory }
                    ]
                },
                { association: 'storage', attributes: ['name'] },
            ],
            group: ['id_product', 'product.id', 'product.unit.id', 'product.category.id', 'storage.id']
        };

        applyPhysicalKardexSearch(optionsDbAll, type, query);

        const allKardexes = await ViewKardex.findAll(optionsDbAll);
        if (allKardexes && allKardexes.length > 0) {
            const productIds = allKardexes.map(k => k.id_product);
            const firstMovements = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    'id_storage',
                    [sequelize.fn('MIN', sequelize.col('id')), 'min_id']
                ],
                where: {
                    [Op.and]: [
                        id_sucursal ? { id_sucursal } : {},
                        id_storage ? { id_storage } : {},
                        { id_product: { [Op.in]: productIds } },
                        { date: whereDate }
                    ]
                },
                group: ['id_product', 'id_storage'],
                raw: true
            });
            const minIds = firstMovements.map(m => m.min_id).filter(Boolean);
            const initialBalances = minIds.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'id_storage', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIds }
                },
                raw: true
            }) : [];
            const balanceMap = {};
            for (const bal of initialBalances) {
                balanceMap[`${bal.id_product}:${bal.id_storage}`] = bal.saldo_inicial;
            }
            for (const kardex of allKardexes) {
                const quantity_inicial = Number(balanceMap[`${kardex.id_product}:${kardex.id_storage}`] || 0);
                kardex.dataValues.quantity_inicial = quantity_inicial;
                kardex.dataValues.quantity_input = exactAdd(kardex.dataValues.quantity_input || 0, quantity_inicial);
                kardex.dataValues.quantity_saldo = exactAdd(kardex.dataValues.quantity_saldo || 0, quantity_inicial);
            }
        }

        await attachAvailabilityToKardexRows(allKardexes, { idSucursal: id_sucursal, idStorage: id_storage });
        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;
        const filteredAllKardexes = showZeroSaldo
            ? allKardexes
            : allKardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        const decimal = await getNumberDecimal();
        const { totals: unitTotals, categories: categoryUnitTotals } = summarizePhysicalKardex(filteredAllKardexes);
        const totals = Object.fromEntries(['quantity_input', 'quantity_output', 'quantity_saldo']
            .map(field => [field, formatUnitTotals(unitTotals, field, decimal)]));
        const categoryTotals = Object.fromEntries([...categoryUnitTotals.entries()].map(([category, values]) => [
            category,
            Object.fromEntries(['quantity_input', 'quantity_output', 'quantity_saldo']
                .map(field => [field, formatUnitTotals(values, field, decimal)])),
        ]));

        // Paginación en memoria
        const limitNum = parseInt(limit, 10) || 50;
        const pageNum = parseInt(page, 10) || 1;
        const total = filteredAllKardexes.length;
        const offset = (pageNum - 1) * limitNum;
        const paginatedData = filteredAllKardexes.slice(offset, offset + limitNum);

        const getPreviousPage = (p) => p <= 1 ? null : p - 1;
        const getNextPage = (p, lim, tot) => (tot / lim) > p ? p + 1 : null;
        const getFrom = (p, lim) => (p * lim) - lim + 1;
        const getTo = (p, lim, tot) => Math.min((p * lim), tot);

        return res.status(200).json({
            ok: true,
            kardexes: {
                previousPage: getPreviousPage(pageNum),
                currentPage: pageNum,
                nextPage: getNextPage(pageNum, limitNum, total),
                total: total,
                total_all: total,
                per_page: limitNum,
                from: total === 0 ? 0 : getFrom(pageNum, limitNum),
                to: getTo(pageNum, limitNum, total),
                data: paginatedData,
                totals,
                categoryTotals
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const getTotalStockRecumet = async (req = request, res = response) => {
    try {
        const { query, page, limit, id_sucursal, id_sucursales, id_storage, id_storages, id_product, id_products, category_ids, filterBy, date1, date2 } = req.query;
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');

        let sucursalCond = {};
        const targetSucursales = id_sucursales || id_sucursal;
        if (targetSucursales) {
            const sucursalIds = String(targetSucursales).split(',').map(id => id.trim()).filter(Boolean);
            if (sucursalIds.length > 0) {
                sucursalCond = { id_sucursal: { [Op.in]: sucursalIds } };
            }
        }

        let storageCond = {};
        const targetStorages = id_storages || id_storage;
        if (targetStorages) {
            const storageIds = String(targetStorages).split(',').map(id => id.trim()).filter(Boolean);
            if (storageIds.length > 0) {
                storageCond = { id_storage: { [Op.in]: storageIds } };
            }
        }

        let productCond = {};
        const targetProducts = id_products || id_product;
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                productCond = { id_product: { [Op.in]: productIds } };
            }
        }

        let whereProduct = {};
        if (targetProducts) {
            const productIds = String(targetProducts).split(',').map(id => id.trim()).filter(Boolean);
            if (productIds.length > 0) {
                whereProduct = { id: { [Op.in]: productIds } };
            }
        }
        if (category_ids) {
            let ids = [];
            if (Array.isArray(category_ids)) {
                ids = category_ids;
            } else if (typeof category_ids === 'string') {
                ids = category_ids.split(',').map(id => id.trim()).filter(Boolean);
            }
            if (ids.length > 0) {
                whereProduct = {
                    ...whereProduct,
                    id_category: { [Op.in]: ids }
                };
            }
        }

        const category_types = ['RAW_MATERIAL', 'FINISHED_PRODUCT'];
        let whereCategory = {
            type: {
                [Op.in]: category_types
            }
        };

        const orderNew = normalizeStockOrder(req.query.field_sort, req.query.order);
        const optionsDbAll = {
            order: [
                ['product', 'category', 'name', 'ASC'],
                orderNew
            ],
            attributes: [
                'id_product',
                [sequelize.fn('MIN', sequelize.col('ViewKardex.id')), 'first_movement_id'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
                    productCond,
                    stockProviderCondition(req.query),
                    { date: whereDate },
                ]
            },
            include: [
                {
                    association: 'product', attributes: { exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt'] },
                    where: whereProduct,
                    include: [
                        { association: 'unit', attributes: ['name', 'siglas'] },
                        { association: 'category', attributes: ['name', 'type'], where: whereCategory }
                    ]
                }
            ],
            group: ['id_product', 'product.id', 'product.unit.id', 'product.category.id']
        };

        if (query) {
            let where = {
                [Op.or]: [
                    { '$product.name$': { [Op.iLike]: `%${query}%` } },
                    { '$product.cod$': { [Op.iLike]: `%${query}%` } }
                ]
            };
            optionsDbAll.where[Op.and].push(where);
        }

        const allKardexes = await ViewKardex.findAll(optionsDbAll);
        if (allKardexes && allKardexes.length > 0) {
            const productIds = allKardexes.map(k => k.id_product);
            const minIds = allKardexes.map(row => row.dataValues.first_movement_id).filter(Boolean);
            const initialBalances = minIds.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIds }
                },
                raw: true
            }) : [];
            const balanceMap = {};
            for (const bal of initialBalances) {
                balanceMap[bal.id_product] = bal.saldo_inicial;
            }
            for (const kardex of allKardexes) {
                const quantity_inicial = Number(balanceMap[kardex.id_product] || 0);
                kardex.dataValues.quantity_inicial = quantity_inicial;
                kardex.dataValues.quantity_input = Number(kardex.dataValues.quantity_input) + quantity_inicial;
                kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + quantity_inicial;
            }
        }

        await attachAvailabilityToKardexRows(allKardexes, {
            idSucursal: id_sucursales || id_sucursal,
            idStorage: id_storages || id_storage,
        });
        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;
        const filteredAllKardexes = showZeroSaldo
            ? allKardexes
            : allKardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        const totalSaldo = {};
        const totalSaldoMp = {};
        const totalSaldoPt = {};
        const categoryTotals = {};

        for (const kardex of filteredAllKardexes) {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            const unit = unitLabel(kardex.product);
            addUnitQuantity(totalSaldo, unit, saldoVal);

            if (kardex.product && kardex.product.category) {
                const categoryName = kardex.product.category.name;
                const catType = kardex.product.category.type;

                if (catType === 'RAW_MATERIAL') {
                    addUnitQuantity(totalSaldoMp, unit, saldoVal);
                } else if (catType === 'FINISHED_PRODUCT') {
                    addUnitQuantity(totalSaldoPt, unit, saldoVal);
                }

                if (!categoryTotals[categoryName]) {
                    categoryTotals[categoryName] = {
                        quantity_saldo: {}
                    };
                }
                addUnitQuantity(categoryTotals[categoryName].quantity_saldo, unit, saldoVal);
            }
        }

        // Calculate totals by sucursal
        const sucursalTotals = {};
        const optionsDbSucursalProduct = {
            attributes: [
                'id_sucursal',
                'id_product',
                [sequelize.fn('MIN', sequelize.col('ViewKardex.id')), 'first_movement_id'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
                    productCond,
                    stockProviderCondition(req.query),
                    { date: whereDate },
                ]
            },
            include: [
                {
                    association: 'product',
                    attributes: ['id_category', 'id_unit'],
                    where: whereProduct,
                    include: [
                        { association: 'category', attributes: ['name', 'type'], where: whereCategory },
                        { association: 'unit', attributes: ['siglas'] }
                    ]
                },
                {
                    association: 'sucursal',
                    attributes: ['name']
                }
            ],
            group: ['id_sucursal', 'id_product', 'product.id', 'product.category.id', 'product.unit.id', 'sucursal.id'],
            raw: true,
            nest: true
        };

        if (query) optionsDbSucursalProduct.where[Op.and].push({
            [Op.or]: [
                { '$product.name$': { [Op.iLike]: `%${query}%` } },
                { '$product.cod$': { [Op.iLike]: `%${query}%` } }
            ]
        });

        const sucursalProductKardexes = await ViewKardex.findAll(optionsDbSucursalProduct);
        if (sucursalProductKardexes && sucursalProductKardexes.length > 0) {
            const productIds = sucursalProductKardexes.map(k => k.id_product);
            const minIdsSP = sucursalProductKardexes.map(row => row.first_movement_id).filter(Boolean);
            const initialBalancesSP = minIdsSP.length > 0 ? await ViewKardex.findAll({
                attributes: ['id_product', 'id_sucursal', 'saldo_inicial'],
                where: {
                    id: { [Op.in]: minIdsSP }
                },
                raw: true
            }) : [];

            const balanceMapSP = {};
            for (const bal of initialBalancesSP) {
                balanceMapSP[`${bal.id_product}_${bal.id_sucursal}`] = bal.saldo_inicial;
            }

            for (const sp of sucursalProductKardexes) {
                const key = `${sp.id_product}_${sp.id_sucursal}`;
                const quantity_inicial = Number(balanceMapSP[key] || 0);
                sp.quantity_saldo = Number(sp.quantity_saldo) + quantity_inicial;
            }
        }

        const filteredSP = showZeroSaldo
            ? sucursalProductKardexes
            : sucursalProductKardexes.filter(sp => Number(sp.quantity_saldo) > 0);        for (const sp of filteredSP) {
            const sucursalId = sp.id_sucursal;
            const sucursalName = sp.sucursal?.name || `Sucursal ${sucursalId}`;
            const catType = sp.product?.category?.type;
            const saldoVal = Number(sp.quantity_saldo || 0);

            if (!sucursalTotals[sucursalId]) {
                sucursalTotals[sucursalId] = {
                    name: sucursalName,
                    quantity_saldo: {},
                    quantity_saldo_mp: {},
                    quantity_saldo_pt: {}
                };
            }

            const unit = sp.product?.unit?.siglas || 'SIN UNIDAD';
            addUnitQuantity(sucursalTotals[sucursalId].quantity_saldo, unit, saldoVal);
            if (catType === 'RAW_MATERIAL') {
                addUnitQuantity(sucursalTotals[sucursalId].quantity_saldo_mp, unit, saldoVal);
            } else if (catType === 'FINISHED_PRODUCT') {
                addUnitQuantity(sucursalTotals[sucursalId].quantity_saldo_pt, unit, saldoVal);
            }
        }

        for (const item of Object.values(sucursalTotals)) {
            item.quantity_saldo_text = formatStockUnitTotals(item.quantity_saldo);
            item.quantity_saldo_mp_text = formatStockUnitTotals(item.quantity_saldo_mp);
            item.quantity_saldo_pt_text = formatStockUnitTotals(item.quantity_saldo_pt);
        }
        for (const item of Object.values(categoryTotals)) item.quantity_saldo = formatStockUnitTotals(item.quantity_saldo);

        const totals = {
            quantity_saldo: totalSaldo,
            quantity_saldo_mp: totalSaldoMp,
            quantity_saldo_pt: totalSaldoPt
        };

        const limitNum = parseInt(limit, 10) || 50;
        const pageNum = parseInt(page, 10) || 1;
        const total = filteredAllKardexes.length;
        const offset = (pageNum - 1) * limitNum;
        const paginatedData = filteredAllKardexes.slice(offset, offset + limitNum);

        const getPreviousPage = (p) => p <= 1 ? null : p - 1;
        const getNextPage = (p, lim, tot) => (tot / lim) > p ? p + 1 : null;
        const getFrom = (p, lim) => (p * lim) - lim + 1;
        const getTo = (p, lim, tot) => Math.min((p * lim), tot);

        return res.status(200).json({
            ok: true,
            kardexes: {
                previousPage: getPreviousPage(pageNum),
                currentPage: pageNum,
                nextPage: getNextPage(pageNum, limitNum, total),
                total: total,
                total_all: total,
                per_page: limitNum,
                from: total === 0 ? 0 : getFrom(pageNum, limitNum),
                to: getTo(pageNum, limitNum, total),
                data: paginatedData,
                totals,
                categoryTotals,
                sucursalTotals
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
};

const getStockDiagnosticHandler = async (req = request, res = response) => {
    try {
        const { id_sucursal, id_storage, limit } = req.query;
        if (!canAccessSucursal(req.userAuth, id_sucursal)) return sendPermissionDenied(res, 'consultar el diagnóstico fuera de una sucursal autorizada');
        const diagnostic = await getStockDiagnostic({
            idSucursal: id_sucursal,
            idStorage: id_storage,
            limit
        });

        return res.status(200).json({
            ok: true,
            diagnostic
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: 'Ocurrió un imprevisto interno | hable con soporte' }]
        });
    }
};

module.exports = {
    getKardexPaginate,
    getDailyKardexPaginate,
    normalizeKardexHistoryOrder,
    getKardexFisicoPaginate,
    getTotalStockRecumet,
    getStockDiagnosticHandler
}

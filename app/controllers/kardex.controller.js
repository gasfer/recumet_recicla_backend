const { response, request } = require('express');
const { sequelize, ViewKardex } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const getKardexPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2, type_kardex, orderNew } = req.query;
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');
        const optionsDb = {
            order: [orderNew],
            attributes: ['type', 'date', 'id_movement', 'type_movement', 'registry_number', 'detail', 'sub_detail', 'quantity', 'quantity_input', 'quantity_output', 'cost_unitario', 'cost_input', 'cost_output', 'saldo', 'cost_saldo'],
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
        return res.status(200).json({
            ok: true,
            kardexes
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte` }],
        });
    }
}

const getKardexFisicoPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2, orderNew, category_ids, category_types } = req.query;
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');

        let whereProduct = {};
        if (category_ids) {
            let ids = category_ids;
            if (!Array.isArray(category_ids)) {
                ids = [category_ids];
            }
            if (ids.length > 0) {
                whereProduct = {
                    id_category: {
                        [Op.in]: ids
                    }
                }
            }
        }

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
                }
            }
        }

        // Configuración para obtener TODOS los registros con todos sus detalles (includes)
        const optionsDbAll = {
            order: [
                ['product', 'category', 'name', 'ASC'],
                orderNew
            ],
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

        if (type) {
            if (type.includes('.')) {
                let [assoc, column] = type.split('.');
                let foundInclude = optionsDbAll.include?.find(i => i.association === assoc);
                if (foundInclude) {
                    if (!foundInclude.where) foundInclude.where = {};
                    if (!isNaN(query)) {
                        foundInclude.where[column] = { [Op.eq]: `${query}` };
                    } else {
                        foundInclude.where[column] = { [Op.iLike]: `%${query}%` };
                    }
                }
            } else {
                let where = {};
                if (!isNaN(query)) {
                    where[type] = { [Op.eq]: `${query}` };
                } else {
                    where[type] = { [Op.iLike]: `%${query}%` };
                }
                optionsDbAll.where[Op.and].push(where);
            }
        }

        const allKardexes = await ViewKardex.findAll(optionsDbAll);
        if (allKardexes && allKardexes.length > 0) {
            const productIds = allKardexes.map(k => k.id_product);
            const firstMovements = await ViewKardex.findAll({
                attributes: [
                    'id_product',
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
                group: ['id_product'],
                raw: true
            });
            const minIds = firstMovements.map(m => m.min_id).filter(Boolean);
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

        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;
        const filteredAllKardexes = showZeroSaldo
            ? allKardexes.filter(k => Number(k.dataValues.quantity_saldo) <= 0)
            : allKardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        let totalInput = 0;
        let totalOutput = 0;
        let totalSaldo = 0;
        const categoryTotals = {};

        for (const kardex of filteredAllKardexes) {
            if (kardex.product && kardex.product.category) {
                const categoryName = kardex.product.category.name;
                const qInput = Number(kardex.dataValues.quantity_input || 0);
                const qOutput = Number(kardex.dataValues.quantity_output || 0);
                const qSaldo = Number(kardex.dataValues.quantity_saldo || 0);

                totalInput += qInput;
                totalOutput += qOutput;
                totalSaldo += qSaldo;

                if (!categoryTotals[categoryName]) {
                    categoryTotals[categoryName] = {
                        quantity_input: 0,
                        quantity_output: 0,
                        quantity_saldo: 0
                    };
                }
                categoryTotals[categoryName].quantity_input += qInput;
                categoryTotals[categoryName].quantity_output += qOutput;
                categoryTotals[categoryName].quantity_saldo += qSaldo;
            }
        }

        const totals = {
            quantity_input: totalInput,
            quantity_output: totalOutput,
            quantity_saldo: totalSaldo
        };

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
        const { query, page, limit, id_sucursal, id_sucursales, id_storage, id_storages, id_product, category_ids, filterBy, date1, date2 } = req.query;
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

        let whereProduct = {};
        if (id_product) {
            whereProduct = { id: id_product };
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

        const orderNew = req.query.orderNew || ['product', 'cod', 'ASC'];
        const optionsDbAll = {
            order: [
                ['product', 'category', 'name', 'ASC'],
                orderNew
            ],
            attributes: [
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
            ],
            where: {
                [Op.and]: [
                    sucursalCond,
                    storageCond,
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
            const firstMovements = await ViewKardex.findAll({
                attributes: [
                    'id_product',
                    [sequelize.fn('MIN', sequelize.col('id')), 'min_id']
                ],
                where: {
                    [Op.and]: [
                        sucursalCond,
                        storageCond,
                        { id_product: { [Op.in]: productIds } },
                        { date: whereDate }
                    ]
                },
                group: ['id_product'],
                raw: true
            });
            const minIds = firstMovements.map(m => m.min_id).filter(Boolean);
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

        const showZeroSaldo = req.query.showZeroSaldo === 'true' || req.query.showZeroSaldo === true;
        const filteredAllKardexes = showZeroSaldo
            ? allKardexes.filter(k => Number(k.dataValues.quantity_saldo) <= 0)
            : allKardexes.filter(k => Number(k.dataValues.quantity_saldo) > 0);

        let totalSaldo = 0;
        let totalSaldoMp = 0;
        let totalSaldoPt = 0;
        const categoryTotals = {};

        for (const kardex of filteredAllKardexes) {
            const saldoVal = Number(kardex.dataValues.quantity_saldo || 0);
            totalSaldo += saldoVal;

            if (kardex.product && kardex.product.category) {
                const categoryName = kardex.product.category.name;
                const catType = kardex.product.category.type;

                if (catType === 'RAW_MATERIAL') {
                    totalSaldoMp += saldoVal;
                } else if (catType === 'FINISHED_PRODUCT') {
                    totalSaldoPt += saldoVal;
                }

                if (!categoryTotals[categoryName]) {
                    categoryTotals[categoryName] = {
                        quantity_saldo: 0
                    };
                }
                categoryTotals[categoryName].quantity_saldo += saldoVal;
            }
        }

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

module.exports = {
    getKardexPaginate,
    getKardexFisicoPaginate,
    getTotalStockRecumet
}
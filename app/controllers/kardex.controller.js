const { response, request } = require('express');
const { sequelize, ViewKardex} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const getKardexPaginate = async (req = request, res = response) => {
    try {
        const {
            query, 
            page, 
            limit, 
            type, 
            id_sucursal, 
            id_storage, 
            id_product, 
            filterBy, 
            date1, 
            date2, 
            type_kardex,
            orderNew,
            category_ids
        } = req.query;
        
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');
        
        // Procesar category_ids
        let categoryIdsArray = null;
        if (category_ids) {
            categoryIdsArray = category_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
        
        // ✅ VALIDAR Y CORREGIR orderNew
        let safeOrder = orderNew || [['date', 'DESC']];
        
        // Si orderNew contiene 'createdAt', reemplazarlo
        if (Array.isArray(safeOrder) && safeOrder.length > 0) {
            if (safeOrder[0].includes('createdAt')) {
                safeOrder = [['date', 'DESC']];
                console.log('⚠️ Campo createdAt reemplazado por date');
            }
        }
        
        const optionsDb = {
            order: safeOrder, // ✅ Usar orden validado
            attributes: [
                'type',
                'date',
                'id_movement',
                'type_movement',
                'registry_number',
                'detail',
                'sub_detail',
                'quantity',
                'quantity_input',
                'quantity_output',
                'cost_unitario',
                'cost_input',
                'cost_output',
                'saldo',
                'cost_saldo'
            ],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    id_product  ? { id_product  } : {},
                    type_kardex ? { type: type_kardex } : {},
                    { date: whereDate },
                ]
            },
            include: [ 
                { 
                    association: 'sucursal', 
                    attributes: ['name', 'city']
                },
                { 
                    association: 'storage', 
                    attributes: ['name']
                },
                { 
                    association: 'product',  
                    attributes: {
                        exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt']
                    },
                    where: categoryIdsArray && categoryIdsArray.length > 0 
                        ? { id_category: { [Op.in]: categoryIdsArray } }
                        : {},
                    include: [ 
                        {
                            association: 'unit', 
                            attributes: ['name', 'siglas']
                        },
                        {
                            association: 'category', 
                            attributes: ['name']
                        }
                    ]
                },
            ]
        };
        
        let kardexes = await paginate(ViewKardex, page, limit, type, query, optionsDb); 
        
        return res.status(200).json({
            ok: true,
            kardexes
        });
    } catch (error) {
        console.log('❌ Error en getKardexPaginate:', error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getKardexFisicoPaginate = async (req = request, res = response) => {
    try {
        const {
            query, 
            page, 
            limit, 
            type, 
            id_sucursal, 
            id_storage, 
            id_product, 
            filterBy, 
            date1, 
            date2,
            orderNew,
            category_ids
        } = req.query;
        
        console.log('🔍 Backend recibió:', {
            category_ids,
            orderNew,
            id_sucursal,
            id_storage
        });
        
        const whereDate = whereDateForType(filterBy, date1, date2, '"ViewKardex"."date"');
        
        // Procesar category_ids
        let categoryIdsArray = null;
        if (category_ids) {
            categoryIdsArray = category_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            console.log('📋 Categorías procesadas:', categoryIdsArray);
        }
        
        // ✅ VALIDAR Y CORREGIR orderNew
        let safeOrder = orderNew || [['product', 'name', 'ASC']];
        
        // Si orderNew contiene 'createdAt', reemplazarlo
        if (Array.isArray(safeOrder) && safeOrder.length > 0) {
            const orderField = safeOrder[0];
            if (Array.isArray(orderField) && orderField.some(field => field.includes('createdAt'))) {
                safeOrder = [['product', 'name', 'ASC']];
                console.log('⚠️ Campo createdAt reemplazado por product.name');
            }
        }
        
        console.log('📊 Orden aplicado:', safeOrder);
        
        const optionsDb = {
            order: safeOrder, // ✅ Usar orden validado
            attributes: [
                'id_product',
                [sequelize.fn('SUM', sequelize.col('quantity_input')), 'quantity_input'],
                [sequelize.fn('SUM', sequelize.col('quantity_output')), 'quantity_output'],
                [sequelize.literal('SUM("ViewKardex"."quantity_input") - SUM("ViewKardex"."quantity_output")'), 'quantity_saldo'],
                [sequelize.fn('SUM', sequelize.col('cost_input')), 'cost_input'],
                [sequelize.fn('SUM', sequelize.col('cost_output')), 'cost_output'],
                [sequelize.literal('SUM("ViewKardex"."cost_input") - SUM("ViewKardex"."cost_output")'), 'cost_saldo']
            ],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    id_product  ? { id_product  } : {},
                    { date: whereDate },
                ]
            },
            include: [ 
                { 
                    association: 'product',  
                    attributes: {
                        exclude: ['id', 'id_category', 'id_unit', 'status', 'createdAt', 'updatedAt']
                    },
                    where: categoryIdsArray && categoryIdsArray.length > 0 
                        ? { id_category: { [Op.in]: categoryIdsArray } }
                        : {},
                    include: [ 
                        { association: 'unit', attributes: ['name', 'siglas'] },
                        { association: 'category', attributes: ['name'] }
                    ]
                },
                { association: 'storage', attributes: ['name'] },
            ],
            group: ['id_product', 'product.id', 'product.unit.id', 'product.category.id', 'storage.id']
        };
        
        let kardexes = await paginate(ViewKardex, page, limit, type, query, optionsDb);
        
        console.log('✓ Kardex base obtenido:', kardexes.data?.length, 'registros');
        
        // Calcular saldo inicial para cada producto
        for (const kardex of kardexes.data) {
            const where = {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    { id_product: kardex.id_product },
                    { date: whereDate },
                ]
            };
            
            const kardex_inicial = await ViewKardex.findOne({
                attributes: ['saldo_inicial'],
                where,
                order: [['id', 'ASC']] 
            });
            
            const quantity_inicial = kardex_inicial ? kardex_inicial.saldo_inicial : 0;
            kardex.dataValues.quantity_inicial = quantity_inicial;
            kardex.dataValues.quantity_input = Number(kardex.dataValues.quantity_input) + Number(quantity_inicial);
            kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + Number(quantity_inicial);
        }
        
        console.log('✓ Kardex físico procesado:', kardexes.data?.length, 'registros');
        
        return res.status(200).json({
            ok: true,
            kardexes
        });
    } catch (error) {
        console.log('❌ Error en getKardexFisicoPaginate:', error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

module.exports = {
    getKardexPaginate,
    getKardexFisicoPaginate
}
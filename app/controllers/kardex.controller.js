const { response, request } = require('express');
const { Kardex ,sequelize} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const getKardexPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal, id_storage, id_provider, id_product, filterBy, date1, date2, type_kardex,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Kardex"."createdAt"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    id_provider ? { id_provider } : {},
                    id_product  ? { id_product  } : {},
                    type_kardex  ? { type:type_kardex  } : {},
                    { createdAt: whereDate },
                    { status: true },
                ]
            },
            include: [ 
                { association: 'provider', attributes: ['full_names','number_document','name_contact']},
                { association: 'sucursal', attributes: ['name','city']},
                { association: 'sucursalOriginDestination', attributes: ['name','city']},
                { association: 'storage', attributes: ['name']},
                { association: 'client'},
                { association: 'productClassified',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']}},
                { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
                  include: [ {association: 'unit', attributes: ['name','siglas']}]
                },
            ]
        };
        let kardexes = await paginate(Kardex, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            kardexes
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getKardexFisicoPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal, id_storage, id_provider, id_product, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Kardex"."createdAt"');
        const optionsDb = {
            order: [orderNew],
            attributes: [
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('MIN(quantity_inicial) + COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
                [sequelize.literal('MIN(quantity_inicial)'), 'quantity_inicial'],
            ],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    id_provider ? { id_provider } : {},
                    id_product  ? { id_product  } : {},
                    { createdAt: whereDate },
                    { status: true },
                ]
            },
            include: [ 
                { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
                  include: [ {association: 'unit', attributes: ['name','siglas']}]
                },
                { association: 'storage', attributes: ['name']},
            ],
            group: ['id_product', 'product.id', 'product.unit.id', 'storage.id']
        };
        let kardexes = await paginate(Kardex, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            kardexes
        });
    } catch (error) {
        console.log(error);
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
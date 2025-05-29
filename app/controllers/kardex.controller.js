const { response, request } = require('express');
const { sequelize, ViewKardex} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');

const getKardexPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2, type_kardex,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"ViewKardex"."date"');
        const optionsDb = {
            order: [orderNew],
            attributes: ['type','date','id_movement','type_movement','registry_number','detail','sub_detail','quantity','quantity_input','quantity_output','cost_unitario','cost_input','cost_output','saldo','cost_saldo'],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    id_product  ? { id_product  } : {},
                    type_kardex  ? { type:type_kardex  } : {},
                    { date: whereDate },
                ]
            },
            include: [ 
                { association: 'sucursal', attributes: ['name','city']},
                { association: 'storage', attributes: ['name']},
                { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
                  include: [ {association: 'unit', attributes: ['name','siglas']}]
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
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getKardexFisicoPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal, id_storage, id_product, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"ViewKardex"."date"');
        const optionsDb = {
            order: [orderNew],
            attributes: [
                'id_product',
                [sequelize.literal('COALESCE(SUM(quantity_input), 0)'), 'quantity_input'],
                [sequelize.literal('COALESCE(SUM(quantity_output), 0)'), 'quantity_output'],
                [sequelize.literal('COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0)'), 'quantity_saldo'],
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
                { association: 'product',  attributes: {exclude: ['id','id_category','id_unit','status','createdAt','updatedAt']},
                  include: [ 
                        {association: 'unit', attributes: ['name','siglas']},
                        {association: 'category', attributes: ['name']}
                    ]
                },
                { association: 'storage', attributes: ['name']},
            ],
            group: ['id_product', 'product.id', 'product.unit.id','product.category.id', 'storage.id']
        };
        let kardexes = await paginate(ViewKardex, page, limit, type, query, optionsDb); 
        for (const kardex of kardexes.data) {
            const where = {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_storage  ? { id_storage  } : {},
                    { id_product :  kardex.id_product  },
                    { date: whereDate },
                ]
            }
            const kardex_inicial = await ViewKardex.findOne({attributes: ['saldo_inicial'],where,order:[['id','ASC']] });
            const quantity_inicial = kardex_inicial.saldo_inicial;
            kardex.dataValues.quantity_inicial = quantity_inicial;
            kardex.dataValues.quantity_input = Number( kardex.dataValues.quantity_input) + Number(quantity_inicial);
            kardex.dataValues.quantity_saldo = Number(kardex.dataValues.quantity_saldo) + Number(quantity_inicial);
        }
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
const paginate = require('../helpers/paginate');
const { response, request } = require('express');
const { History } = require('../database/config');
const { whereDateForType } = require('../helpers/where_range');
const moment = require('moment');
const { Op } = require('sequelize');

const getAllHistory = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,id_sucursal,id_user,orderNew} = req.query;
        console.log(id_sucursal);
        console.log(id_user);
        const whereDate = whereDateForType('MONTH',moment(), moment(), '"History"."createdAt"');
        const optionsDb = {
            order: [orderNew], 
            where: {
                [Op.and]: [
                    id_sucursal    ? { id_sucursal } : {},
                    id_user        ? { id_user  } : {},
                    { status:true },
                    { createdAt: whereDate }
                ]
            },
            attributes: ['description','type','module','action','createdAt','id_reference'],
            include: [
                { 
                    association: 'user', attributes: ['full_names','number_document','cellphone','role'],
                    required:false 
                }
            ]
        };
        let histories = await paginate(History, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            histories
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}


module.exports = { getAllHistory };

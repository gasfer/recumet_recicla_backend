const { response, request } = require('express');
const { Provider, Sector, sequelize, Input,DetailsInput } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');

const getProviderPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, status, orderNew} = req.query;
        let isSearchPos = type === 'pos' ? true : false;   
        let optionsDb = {
            order: [orderNew],
            where: { status },
            include: [ { association: 'category'},{ association: 'sector'}]
        };
        if(isSearchPos) type = null;
        if(isSearchPos) optionsDb.where[Op.or] = [
            { full_names: { [Op.iLike]: `%${query}%`}},
            { number_document: { [Op.iLike]: `%${query}%`}},
            { name_contact: { [Op.iLike]: `%${query}%`}},
        ];
        let providers = await paginate(Provider, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            providers
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getProviderByProductPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, orderNew,id_sucursal, id_product} = req.query;
        let optionsDb = {
            order: [orderNew],
            where: {id_product},
            attributes: {exclude:['status','createdAt','updatedAt']},
            include: [ 
                { 
                    association: 'input', 
                    attributes: ['cod','date_voucher','status'],
                    where: {
                        [Op.and]: [
                            id_sucursal   ? { id_sucursal   } : {},
                            { status: 'ACTIVE' },
                        ]
                    },
                    include: {association:'provider', attributes: ['full_names','status'],}
                },
            ]
        };
        let detailsInput = await paginate(DetailsInput, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            detailsInput
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newProvider = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        const provider = await Provider.create(body,{ transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            provider
        });
    } catch (error) {
        await t.rollback();
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateProvider = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const provider = await Provider.findByPk(id,{ transaction: t });
        await provider.update(body,{ transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Proveedor modificado exitosamente'
        });   
    } catch (error) {
        await t.rollback();
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveProvider = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const provider = await Provider.findByPk(id);
        await provider.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Proveedor activo exitosamente' : 'Proveedor inactivo exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}


const getAllSectorProvider = async (req = request, res = response) => {
    try {
        const { query, page, limit, type,orderNew } = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status: true },
        };
        let sectors = await paginate(Sector, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            sectors
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newSectorProvider = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const sector = await Sector.create(body);
        return res.status(201).json({
            ok: true,
            sector
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deleteSectorProvider = async (req = request, res = response ) => {
    try {
        const { id } = req.params;
        const sector = await Sector.findByPk(id);
        await sector.update({status:false});
        return res.status(201).json({
            ok: true,
            msg: 'Sector eliminado exitosamente'
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
    getProviderPaginate,
    newProvider,
    updateProvider,
    activeInactiveProvider,
    getAllSectorProvider,
    newSectorProvider,
    deleteSectorProvider,
    getProviderByProductPaginate
};

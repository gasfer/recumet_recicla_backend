const { response, request } = require('express');
const { Client, sequelize } = require('../database/config');
const paginate = require('../helpers/paginate');
const get_num_request = require('../helpers/generate-cod');
const { Op } = require('sequelize');

const getClientPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, status, orderNew } = req.query;
        let isSearchPos = type === 'pos' ? true : false;   
        let optionsDb = {
            order: [orderNew],
            where: { status },
        };
        if(isSearchPos) type = null;
        if(isSearchPos) optionsDb.where[Op.or] = [
            { cod: { [Op.iLike]: `%${query}%`}},
            { full_names: { [Op.iLike]: `%${query}%`}},
            { number_document: { [Op.iLike]: `%${query}%`}},
            { razon_social: { [Op.iLike]: `%${query}%`}},
            { business_name: { [Op.iLike]: `%${query}%`}},
        ];
        let clients = await paginate(Client, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            clients
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newClient = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        const client = await Client.create(body, { transaction: t });
        let num = get_num_request('CLI',Number(client.id),5);
        await client.update({cod:num},{ where: {id: client.id}, transaction: t});
        await t.commit();
        return res.status(201).json({
            ok: true,
            client
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

const updateClient = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const client = await Client.findByPk(id,{ transaction: t });
        await client.update(body,{ transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Cliente modificado exitosamente'
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

const activeInactiveClient = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const client = await Client.findByPk(id);
        await client.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Cliente activo exitosamente' : 'Cliente inactivo exitosamente'
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
    getClientPaginate,
    newClient,
    updateClient,
    activeInactiveClient
};

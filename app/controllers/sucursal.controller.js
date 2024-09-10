const { response, request } = require('express');
const { Sucursal } = require('../database/config');
const paginate = require('../helpers/paginate');

const getSucursalPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
            include: [{association: 'storage'}]
        };
        let sucursales = await paginate(Sucursal, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            sucursales
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newSucursal = async (req = request, res = response ) => {
    try {
        let body = req.body;
        body.id_company = 1;
        const sucursal = await Sucursal.create(body);
        return res.status(201).json({
            ok: true,
            sucursal
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateSucursal = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const sucursal = await Sucursal.findByPk(id);
        await sucursal.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Sucursal modificada exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveSucursal = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const sucursal = await Sucursal.findByPk(id);
        await sucursal.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Sucursal activada exitosamente' : 'Sucursal inactiva exitosamente'
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
    getSucursalPaginate,
    newSucursal,
    updateSucursal,
    activeInactiveSucursal
};

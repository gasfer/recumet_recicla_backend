const { response, request } = require('express');
const { Unit } = require('../database/config');
const paginate = require('../helpers/paginate');

const getUnitPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        let units = await paginate(Unit, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            units
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newUnit = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const unit = await Unit.create(body);
        return res.status(201).json({
            ok: true,
            unit
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateUnit = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const unit = await Unit.findByPk(id);
        await unit.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Unidad modificada exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveUnit = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const unit = await Unit.findByPk(id);
        await unit.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Unidad activada exitosamente' : 'Unidad inactiva exitosamente'
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
    getUnitPaginate,
    newUnit,
    updateUnit,
    activeInactiveUnit
};

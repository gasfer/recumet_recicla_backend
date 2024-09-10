const { response, request } = require('express');
const { Scale } = require('../database/config');
const paginate = require('../helpers/paginate');

const getScalePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        let scales = await paginate(Scale, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            scales
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newScale = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const scale = await Scale.create(body);
        return res.status(201).json({
            ok: true,
            scale
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateScale = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const scale = await Scale.findByPk(id);
        await scale.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Balanza modificada exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveScale = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const scale = await Scale.findByPk(id);
        await scale.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Balanza activada exitosamente' : 'Balanza inactiva exitosamente'
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
    getScalePaginate,
    newScale,
    updateScale,
    activeInactiveScale
};

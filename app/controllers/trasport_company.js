const { response, request } = require('express');
const { Trasport_company, Chauffeurs, Cargo_truck } = require('../database/config');
const paginate = require('../helpers/paginate');

const getTrasportCompanyPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
            include: [ 
                {association: 'chauffeurs', required:false, where: { status: true }},
                {association: 'cargo_trucks', required:false, where: { status: true }}
            ]
        };
        let trasport_company = await paginate(Trasport_company, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            trasport_company
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newTrasportCompany = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const trasport_company = await Trasport_company.create(body);
        return res.status(201).json({
            ok: true,
            trasport_company
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateTrasportCompany = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const trasport_company = await Trasport_company.findByPk(id);
        await trasport_company.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Compañía de trasporte modificada exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveTrasportCompany = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const trasport_company = await Trasport_company.findByPk(id);
        await trasport_company.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Compañía de trasporte activada exitosamente' : 'Compañía de trasporte inactiva exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newChauffeur = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const chauffeur = await Chauffeurs.create(body);
        return res.status(201).json({
            ok: true,
            chauffeur
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deleteChauffeur = async (req = request, res = response ) => {
    try {
        const { id } = req.params;
        const chauffeur = await Chauffeurs.findByPk(id);
        await chauffeur.update({status:false});
        return res.status(201).json({
            ok: true,
            msg: 'Chofer eliminado exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newCargoTrucks = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const cargo_truck = await Cargo_truck.create(body);
        return res.status(201).json({
            ok: true,
            cargo_truck
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deleteCargoTrucks = async (req = request, res = response ) => {
    try {
        const { id } = req.params;
        const cargo_truck = await Cargo_truck.findByPk(id);
        await cargo_truck.update({status:false});
        return res.status(201).json({
            ok: true,
            msg: 'Camion eliminado exitosamente'
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
    getTrasportCompanyPaginate,
    newTrasportCompany,
    updateTrasportCompany,
    activeInactiveTrasportCompany,
    newChauffeur,
    deleteChauffeur,
    newCargoTrucks,
    deleteCargoTrucks
};

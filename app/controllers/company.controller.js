const { response, request } = require('express');
const { Company } = require('../database/config');
const paginate = require('../helpers/paginate');

const getCompanyPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        const companies = await paginate(Company, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            companies
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateCompany = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const company = await Company.findByPk(id);
        await company.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Modificación exitosamente'
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
    getCompanyPaginate,
    updateCompany,
};

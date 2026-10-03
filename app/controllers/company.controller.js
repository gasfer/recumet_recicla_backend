const { response, request } = require('express');
const { Company, History, sequelize } = require('../database/config');
const paginate = require('../helpers/paginate');
const { normalizeDecimalPlaces } = require('../helpers/decimals-value');
const path = require('path');
const fs = require('fs');

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
        const body = { ...req.body };
        if (Object.prototype.hasOwnProperty.call(body, 'decimals')) {
            try { body.decimals = normalizeDecimalPlaces(body.decimals); }
            catch (error) { return res.status(422).json({ ok: false, errors: [{ msg: error.message }] }); }
        }
        await sequelize.transaction(async (transaction) => {
            const company = await Company.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!company) throw Object.assign(new Error('Empresa no encontrada'), { statusCode: 404 });
            const previousDecimals = company.decimals;
            await company.update(body, { transaction });
            if (body.decimals !== undefined && Number(previousDecimals) !== body.decimals) {
                await History.create({ id_user: req.userAuth?.id, module: 'EMPRESA', type: 'CONFIGURACION_DECIMALES', action: 'UPDATE', id_reference: company.id, status: true, description: `Decimales operativos: ${previousDecimals} → ${body.decimals}`, query: JSON.stringify({ previousDecimals, decimals: body.decimals, changedAt: new Date().toISOString() }) }, { transaction });
            }
        });
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

const uploadCompanyLogo = async (req, res = response) => {
    try {
        const company = await Company.findByPk(req.params.id);
        const file = req.file;
        if (!company || !file || file.mimetype !== 'image/png') return res.status(422).json({ ok: false, errors: [{ msg: 'Seleccione un logo PNG válido.' }] });
        const directory = path.join(__dirname, '../../uploads');
        fs.mkdirSync(directory, { recursive: true });
        const filename = 'logo.png';
        await file.mv(path.join(directory, filename));
        await company.update({ logo: filename });
        await History.create({ id_user: req.userAuth?.id, module: 'EMPRESA', type: 'LOGO_EMPRESA', action: 'UPDATE', id_reference: company.id, status: true, description: 'Logo de empresa actualizado.' });
        return res.json({ ok: true, logo: filename });
    } catch (error) { return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo actualizar el logo.' }] }); }
};



module.exports = {
    getCompanyPaginate,
    updateCompany, uploadCompanyLogo,
};

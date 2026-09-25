const { response, request } = require('express');
const { Company, History } = require('../database/config');
const paginate = require('../helpers/paginate');
const { normalizeDecimalPlaces, setDecimalPlaces } = require('../helpers/decimals-value');
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
        const company = await Company.findByPk(id);
        if (!company) return res.status(404).json({ ok: false, errors: [{ msg: 'Empresa no encontrada' }] });
        const previousDecimals = company.decimals;
        if (Object.prototype.hasOwnProperty.call(body, 'decimals')) body.decimals = normalizeDecimalPlaces(body.decimals);
        await company.update(body);
        if (body.decimals !== undefined) {
            setDecimalPlaces(body.decimals);
            await History.create({ id_user: req.userAuth?.id, module: 'EMPRESA', type: 'CONFIGURACION_DECIMALES', action: 'UPDATE', id_reference: company.id, status: true, description: `Decimales operativos: ${previousDecimals} → ${body.decimals}`, query: JSON.stringify({ previousDecimals, decimals: body.decimals }) });
        }
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

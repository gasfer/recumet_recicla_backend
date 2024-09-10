const { response, request } = require('express');
const { Bank, sequelize }   = require('../database/config');
const paginate              = require('../helpers/paginate');

const getBankPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
        };
        let banks = await paginate(Bank, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            banks
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newBank = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        const bank = await Bank.create(body, { transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            bank
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

const updateBank = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const bank = await Bank.findByPk(id, { transaction: t });
        await bank.update(body, { transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Banco modificado exitosamente'
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

const activeInactiveBank = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const bank = await Bank.findByPk(id);
        await bank.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Banco activado exitosamente' : 'Banco inactivo exitosamente'
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
    getBankPaginate,
    newBank,
    updateBank,
    activeInactiveBank
};

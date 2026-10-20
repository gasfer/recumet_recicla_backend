const { response, request } = require('express');
const { Sucursal, Storage, sequelize } = require('../database/config');
const paginate = require('../helpers/paginate');

const createStoragesForBranch = async (names, branchId, transaction) => {
    if (!Array.isArray(names) || names.length === 0) return [];
    return Storage.bulkCreate(names.map(name => ({
        name: String(name).trim(),
        id_sucursal: branchId,
        status: true,
    })), { transaction });
};

const getSucursalPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status },
            include: [{association: 'storage', where: {status: true}, required:false}]
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
        const { storageNames = [], ...body } = req.body;
        body.id_company = 1;
        const sucursal = await sequelize.transaction(async transaction => {
            const branch = await Sucursal.create(body, { transaction });
            await createStoragesForBranch(storageNames, branch.id, transaction);
            return branch;
        });
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
        const { storageNames = [], ...body } = req.body;
        const sucursal = await sequelize.transaction(async transaction => {
            const branch = await Sucursal.findByPk(id, { transaction });
            if (!branch) return null;
            await branch.update(body, { transaction });
            await createStoragesForBranch(storageNames, branch.id, transaction);
            return branch;
        });
        if (!sucursal) return res.status(404).json({ ok: false, errors: [{ msg: 'La sucursal no existe' }] });
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

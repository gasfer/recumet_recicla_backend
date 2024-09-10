const { response, request } = require('express');
const { Storage } = require('../database/config');
const paginate = require('../helpers/paginate');

const getStoragesPaginate = async (req = request, res = response) => {
    try {
        const userAuth = req.userAuth;
        const {query, page, limit, type,id_sucursal, status,orderNew} = req.query;
        const optionsDb = {
            order: [orderNew],
            where: { status,id_sucursal },
            include: [ 
                { association: 'sucursal'}
            ]
        };
        let storages = await paginate(Storage, page, limit, type, query, optionsDb); 
        if(userAuth.role != 'ADMINISTRADOR') {
            /* Filtramos solo los almacenes de las sucursales que tiene asignado el solicitante */
            const storagesTemp = storages.data;
            storages.data = storagesTemp.filter((storage) =>
                userAuth.assign_sucursales.some((resp) => storage.id_sucursal === resp.id_sucursal)
            );
        }
        return res.status(200).json({
            ok: true,
            storages
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newStorage = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const storage = await Storage.create(body);
        return res.status(201).json({
            ok: true,
            storage
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateStorage = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const storage = await Storage.findByPk(id);
        await storage.update(body);
        return res.status(201).json({
            ok: true,
            msg: 'Almacén modificado exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const activeInactiveStorage = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const storage = await Storage.findByPk(id);
        await storage.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Almacén activada exitosamente' : 'Almacén inactiva exitosamente'
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
    getStoragesPaginate,
    newStorage,
    updateStorage,
    activeInactiveStorage
};

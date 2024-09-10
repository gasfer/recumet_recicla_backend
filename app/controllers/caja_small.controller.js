const { response, request } = require('express');
const { CajaSmall,sequelize, DetailsCajaSmall,History } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const { validaOpenCajaSmall } = require('../middlewares/validators/caja_small');

const getCajasSmall = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal,id_user, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"CajaSmall"."date_apertura"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_sucursal ? { id_sucursal } : {},
                    id_user     ? { id_user } : {},
                    { date_apertura: whereDate }
                ]
            },
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'user', attributes: ['full_names','number_document']},
            ]
        };
        let cajas_small = await paginate(CajaSmall, page, limit, type, query, optionsDb); 
        for (const caja_small of cajas_small.data) {
            caja_small.dataValues.total_movements =  await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        }
        return res.status(200).json({
            ok: true,
            cajas_small
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }    
}

const getTotalDetailsCajasSmall = async (req = request, res = response) => {
    try {
        const {id_sucursal} = req.query;
        const id_user = req.userAuth.id;
        const caja_small = await validaOpenCajaSmall(id_sucursal,id_user);
        if(!caja_small) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal no esta ABIERTO`}],
            });
        }
        const total_movements = await getTotalesAndMovements(caja_small.id,caja_small.monto_apertura);
        return res.status(200).json({
            ok: true,
            id_caja_small: caja_small.id,
            ...total_movements
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    } 
}


const getTotalesAndMovements = async (id_caja_small, monto_apertura) => {
    const total_ingresos = await DetailsCajaSmall.sum('monto', { where: {id_caja_small, type: 'INGRESO', status: true } }); // 50
    const total_gastos = await DetailsCajaSmall.sum('monto', { where: {id_caja_small, type: 'GASTO', status: true } }); // 50
    const ingresos = await DetailsCajaSmall.findAll({ where: {id_caja_small, type: 'INGRESO', status: true } });
    const gastos = await DetailsCajaSmall.findAll({ where: {id_caja_small, type: 'GASTO', status: true } }); 
    const saldo = Number(total_ingresos) - Number(total_gastos);
    const monto_apertura_mas_saldo = Number(monto_apertura) + Number(saldo);
    return {
        id_caja_small,
        total_ingresos,
        total_gastos,
        saldo,
        monto_apertura:Number(monto_apertura),
        monto_apertura_mas_saldo,
        ingresos,
        gastos
    }
}
const openCajaSmall = async (req = request, res = response) => {
    try {
        const {monto_apertura, id_sucursal} = req.body;
        const id_user = req.userAuth.id;
        const is_open = await validaOpenCajaSmall(id_sucursal,id_user) ;
        if(is_open) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal ya fue ABIERTO`}],
            });
        }
        await CajaSmall.create({
            date_apertura: new Date(),
            monto_apertura, id_user, id_sucursal,
            status: 'ABIERTO'
        });
        return res.status(201).json({
            ok: true,
            msg: 'Caja abierta correctamente.'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newDetailCajaSmall = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const {type_payment,id_bank,type,account_payment,monto,description,id_sucursal} = req.body;
        const id_user = req.userAuth.id;
        const caja_small = await validaOpenCajaSmall(id_sucursal,id_user);
        if(!caja_small) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal no esta ABIERTO`}],
            });
        }
        const detail_small = await DetailsCajaSmall.create({
            id_caja_small: caja_small.id,
            date: new Date(),
            type,
            type_payment, id_bank,
            account_payment, monto,
            description,
            status: true
        }, { transaction: t });
          /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `NUEVO ${type} CONCEPTO: ${description}`,
            type: `NUEVO ${type}`,
            module: 'CAJA',
            id_sucursal,
            action: 'create',
            id_reference: detail_small.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Movimiento registrado exitosamente'
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

const closeCajaSmall = async (req = request, res = response) => {
    try {
        const {monto_cierre, id_sucursal} = req.body;
        const id_user = req.userAuth.id;
        const caja_small = await validaOpenCajaSmall(id_sucursal,id_user) ;
        if(!caja_small) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal no esta ABIERTO`}],
            });
        }
        await CajaSmall.update({
            date_cierre: new Date(),
            monto_cierre, status: 'CIERRE'
        },{where:{id_user, id_sucursal, status: 'ABIERTO'}});
        return res.status(201).json({
            ok: true,
            msg: 'Caja cierre correctamente.'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const editMontoAperturaCajaSmall = async (req = request, res = response) => {
    try {
        const {monto_apertura, id_sucursal} = req.body;
        const id_user = req.userAuth.id;
        const caja_small = await validaOpenCajaSmall(id_sucursal,id_user) ;
        if(!caja_small) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `La caja para el usuario y sucursal no esta ABIERTO`}],
            });
        }
        caja_small.monto_apertura = monto_apertura;
        await caja_small.save();
        return res.status(201).json({
            ok: true,
            msg: 'Monto de apertura modificado correctamente.'
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
    openCajaSmall,
    closeCajaSmall,
    newDetailCajaSmall,
    getCajasSmall,
    getTotalDetailsCajasSmall,
    editMontoAperturaCajaSmall,
    getTotalesAndMovements
};

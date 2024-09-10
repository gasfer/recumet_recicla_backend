const { response, request } = require('express');
const { AccountsReceivable , AbonosAccountsReceivable ,sequelize, History,DetailsCajaSmall,CajaSmall} = require('../database/config');
const paginate = require('../helpers/paginate');
const { whereDateForType } = require('../helpers/where_range');
const { Op } = require('sequelize');
const { validaOpenCajaSmall } = require('../middlewares/validators/caja_small');


const getAccountsReceivablePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status_account,id_client, id_sucursal, type_registry,filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"AccountsReceivable"."createdAt"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_client      ? { id_client      } : {},
                    id_sucursal    ? { id_sucursal    } : {},
                    status_account ? { status_account } : {},
                    { status: true },
                    { createdAt: whereDate }
                ]
            },
            include: [
                { association: 'sucursal',attributes: ['name'] },
                { association: 'client', attributes: ['full_names']}, 
                { association: 'output', 
                    where: { [Op.and]: [
                        type_registry ? { type_registry } : {},
                    ]},
                    include:[  
                        { association: 'scale', attributes: ['name']},
                        { association: 'user', attributes: ['full_names','number_document']},
                    ]
                },
                // { association: 'abonosAccountsReceivable', required:false,where: {status:true}, include:[  
                //     { association: 'user', attributes: ['full_names','number_document']},
                // ]},
            ]
        };
        let accountsReceivable = await paginate(AccountsReceivable, page, limit, type, query, optionsDb); 
        for (const accountReceivable of accountsReceivable.data) {
            accountReceivable.dataValues.abonosAccountsReceivable =  await AbonosAccountsReceivable.findAll({
                where: { status: true, id_account_receivable: accountReceivable.id},
                include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            });
        }
        return res.status(200).json({
            ok: true,
            accountsReceivable
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newAbonoAccountReceivable = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        body.status = true;
        const id_user = req.userAuth.id;
        const { id_account_receivable, monto_abono, date_abono } = body;
        const accountsReceivable = await AccountsReceivable.findByPk(id_account_receivable,{ transaction: t });
        let total_account_monto = Number(accountsReceivable.monto_abonado) + Number(monto_abono);
        let new_total_restante = Number(accountsReceivable.total) - Number(total_account_monto);
        //validación no negativo, restante a pagar
        if(new_total_restante < 0) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `El monto abono es superior a la deuda`}],
            });
        }
        //si el restante es 0, la cuenta a pagar queda como estado "PAGADO"
        if(new_total_restante == 0){
            accountsReceivable.status_account = 'PAGADO';
        }
        accountsReceivable.monto_abonado = total_account_monto;
        accountsReceivable.monto_restante = new_total_restante;
        await accountsReceivable.save({transaction: t});
        const abonosAccountsReceivable = await AbonosAccountsReceivable.create({
            id_account_receivable, date_abono, monto_abono, total_abonado: total_account_monto,
            restante_credito: new_total_restante, id_user: req.userAuth.id,status: true
        },{ transaction: t });
        //**Ingreso CAJA abono */
        const caja_small = await validaOpenCajaSmall(accountsReceivable.id_sucursal,id_user);
        const data_detail_caja = {
            date: new Date(),
            type: 'INGRESO',
            monto: monto_abono,
            description: `POR ABONO CREDITO #${accountsReceivable.cod} ABONO #${abonosAccountsReceivable.id}`,
            status: true
        }
        if(caja_small) { //caja abierta
            data_detail_caja.id_caja_small = caja_small.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } else { //abrir caja
            const new_open_caja = await CajaSmall.create({
                date_apertura: new Date(),
                monto_apertura: 0, id_user, id_sucursal:accountsReceivable.id_sucursal,
                status: 'ABIERTO'
            }, { transaction: t });
            data_detail_caja.id_caja_small = new_open_caja.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } 
        /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `ABONO ${accountsReceivable.description}`,
            type: 'NUEVO ABONO',
            module: 'ACCOUNTS_RECEIVABLE',
            action: 'CREATE',
            id_sucursal: accountsReceivable.id_sucursal,
            id_reference: abonosAccountsReceivable.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Abono agregado correctamente',
            abonosAccountsReceivable
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ABONO: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}


const deleteAbonoAccountReceivable = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_abono } = req.params;
        const abonoAccountsReceivable = await AbonosAccountsReceivable.findByPk(id_abono,{ transaction: t });
        //validar solo puede anular el ultimo abono
        const maxIdAbono = await AbonosAccountsReceivable.max('id',{ where: {id_account_receivable:abonoAccountsReceivable.id_account_receivable,status:true},transaction: t});
        if(id_abono != maxIdAbono){
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `Por favor, tenga en cuenta que solo puede anular el último abono realizado.`}],
            });
        }
        //cambio de estado del abono
        await abonoAccountsReceivable.update({status:false},{ transaction: t });
        const abono_anulado = Number(abonoAccountsReceivable.monto_abono);
        //Cuenta por pagar montos modificados y estado
        const accountsReceivable = await AccountsReceivable.findByPk(abonoAccountsReceivable.id_account_receivable,{ transaction: t });
        accountsReceivable.status_account = 'PENDIENTE';
        const newMontoAbonado = Number(accountsReceivable.monto_abonado) - abono_anulado
        accountsReceivable.monto_abonado = newMontoAbonado;
        accountsReceivable.monto_restante = Number(accountsReceivable.total) - newMontoAbonado;
        await accountsReceivable.save({transaction: t});
        // //**ANULAR CAJA */
        await DetailsCajaSmall.update({ status: false }, {
            where: { description: `POR ABONO CREDITO #${accountsReceivable.cod} ABONO #${abonoAccountsReceivable.id}`},
            transaction: t
        });
        /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO ABONO ${accountsReceivable.description}`,
            type: 'ANULO ABONO',
            module: 'ACCOUNTS_RECEIVABLE',
            action: 'DELETE',
            id_sucursal: accountsReceivable.id_sucursal,
            id_reference: abonoAccountsReceivable.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg:'Abono eliminado exitosamente'
        });   
    } catch (error) {
        await t.rollback();
        console.log('ERROR DELETE ABONO: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

module.exports = {
    getAccountsReceivablePaginate,
    newAbonoAccountReceivable,
    deleteAbonoAccountReceivable
};

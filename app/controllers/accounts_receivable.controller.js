const { response, request } = require('express');
const { AccountsReceivable , AbonosAccountsReceivable, viewAbonosAccountReceivablesAll, AbonosAccountsReceivableMultiple,sequelize, History,DetailsCajaSmall,CajaSmall} = require('../database/config');
const paginate = require('../helpers/paginate');
const { whereDateForType } = require('../helpers/where_range');
const { Op } = require('sequelize');
const { validaOpenCajaSmall } = require('../middlewares/validators/caja_small');


const getAccountsReceivablePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, status_account,id_client, id_sucursal, type_registry,filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"output"."date_output"');
        const where = {
            [Op.and]: [
                id_client    ? { id_client   } : {},
                id_sucursal   ? { id_sucursal   } : {},
                status_account ? { status_account   } : {},
                { status: true },  
            ]
        }
        const optionsDb = {
            order: [orderNew],
            where,
            include: [
                { association: 'sucursal',attributes: ['name'] },
                { association: 'client', attributes: ['full_names']}, 
                { association: 'output', 
                    where: { [Op.and]: [
                        type_registry ? { type_registry } : {},
                        { date_output: whereDate }
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
        const optionsSum = {
            where,  
            include: [{
                attributes: [],
                association: 'output',
                where: { [Op.and]: [
                    type_registry ? { type_registry } : {},
                    { date_output: whereDate }
                ]}
            }],
        };
        const total_abonados = await AccountsReceivable.sum('AccountsReceivable.monto_abonado', optionsSum);
        const total_restante = await AccountsReceivable.sum('AccountsReceivable.monto_restante', optionsSum);
        const total_account = await AccountsReceivable.sum('AccountsReceivable.total',optionsSum );
        for (const accountReceivable of accountsReceivable.data) {
            accountReceivable.dataValues.abonosAccountsReceivable =  await AbonosAccountsReceivable.findAll({
                where: { status: true, id_account_receivable: accountReceivable.id},
                include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            });
        }
        accountsReceivable.totals = {
            total_abonados,
            total_restante,
            total_account
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

const getAbonosAllReceivablesPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, id_client, id_sucursal, filterBy, date1, date2, orderNew} = req.query;
        let {type}= req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"viewAbonosAccountReceivablesAll"."date_abono"');
        const where = {
            [Op.and]: [
                id_sucursal     ? { id_sucursal   } : {},
                id_client       ? { id_client   } : {},
                { date_abono: whereDate },
                type == 'codes_output' ?   {codes_output: {
                    [Op.contains]: [query]
                  } }: {}
            ]
        }
        if( type == 'codes_output') type = null;
        const optionsDb = {
            order: [orderNew],
            where,
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'user',attributes: ['full_names'] },
                { association: 'client',attributes: ['full_names'] },
            ]
        };
        let accountsReceivablesAll = await paginate(viewAbonosAccountReceivablesAll, page, limit, type, query, optionsDb);
        const total_abonados = await viewAbonosAccountReceivablesAll.sum('viewAbonosAccountReceivablesAll.monto_abono', {where});
        accountsReceivablesAll.totals = {
            total_abonados,
        }
        return res.status(200).json({
            ok: true,
            accountsReceivablesAll
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
        const { id_account_receivable } = body;
        const accountsReceivable = await AccountsReceivable.findByPk(id_account_receivable,{ transaction: t,
            include:[
                {association:'output', attributes:['id','cod']}
            ]
         });
        const abonosAccountsReceivable = await payAbonoAccount(accountsReceivable,body,req.userAuth.id,false,t);
        if(abonosAccountsReceivable.ok){
            await t.commit();
            return res.status(201).json({
                ok: true,
                msg: 'Abono agregado correctamente',
                ...abonosAccountsReceivable
            });
        } else {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: abonosAccountsReceivable.msg }],
            });
        }
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

const getAccountAllClient = async (req = request, res = response) => {
    try {
        const {id_client} = req.query;
        const where = {
            [Op.and]: [
                id_client ? { id_client } : {},
               { status: true },
               {status_account:'PENDIENTE' }
            ]
        }
        let accountsReceivable = await AccountsReceivable.findAll({order: [['id', 'ASC']], where, include:[{
            attributes:['cod','date_output','type_registry','number_registry'],
            association:'output',
            include:[{
                attributes:['id','quantity'],
                association:'detailsOutput'
            }]
        }]});
        const total_abonados = await AccountsReceivable.sum('AccountsReceivable.monto_abonado', {where});
        const total_restante = await AccountsReceivable.sum('AccountsReceivable.monto_restante', {where});
        const total_account = await AccountsReceivable.sum('AccountsReceivable.total',{where} );
        let total_quantity = 0;
        for (const accountReceivable of accountsReceivable) {
            total_quantity += accountReceivable.output.detailsOutput.reduce((sum, detail) => sum + Number(detail.quantity), 0);
        }
        const totals = {
            total_abonados,
            total_restante,
            total_account,
            total_accounts:accountsReceivable.length,
            total_quantity
        }
        return res.status(200).json({
            ok: true,
            accountsReceivable: {
                totals,
                data: accountsReceivable
            }
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const payAccountMultiple = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_client, monto_abono, date_abono, type_payment,comments,account_input,id_bank,id_sucursal} = req.body;
        if (!monto_abono || isNaN(monto_abono) || !date_abono) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: 'El monto a abonar es inválido, o la fecha' }],
            });
        }
        const where = {
            [Op.and]: [
                id_client ? { id_client } : {},
               { status: true },
               { status_account: 'PENDIENTE'}
            ]
        }
        const accountsReceivable = await AccountsReceivable.findAll({order: [['id', 'ASC']], where ,transaction: t,
            include:[
                {association:'output', attributes:['id','cod']}
            ]
        });
        const total_restante = await AccountsReceivable.sum('AccountsReceivable.monto_restante', {where, transaction: t});
        let remainingAmount = parseFloat(monto_abono);  // El monto por pagar
        // Si no hay cuentas por pagar
        if (!accountsReceivable || accountsReceivable.length === 0) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: 'No se encontraron cuentas por pagar' }],
            });
        }
        //validar monto
        if(remainingAmount > total_restante) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: 'El monto a abonar es mayor al monto total de la deuda' }],
            });
        }

        let ids_account_receivables = [];
        let ids_abonos_receivables = [];
        let codes_output = [];
        //  pagar las cuentas por pagar
        for (let account of accountsReceivable) {
            if (remainingAmount <= 0) break;
            const montoRestante = parseFloat(account.monto_restante);
            let newAbono = 0;
            if (remainingAmount >= montoRestante) {
                newAbono = montoRestante;
                remainingAmount = remainingAmount - montoRestante;
            } else {
                newAbono = remainingAmount;
                remainingAmount = 0;
            }
            const body = req.body; //{monto_abono, date_abono, type_payment, comments, account_input, id_bank} = body;
            body.monto_abono =  newAbono;
            const abonosAccountsReceivable = await payAbonoAccount(account,body,req.userAuth.id,true,t);
            if(!abonosAccountsReceivable.ok) {
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [{ msg: abonosAccountsReceivable.msg }],
                });
            }
            ids_account_receivables.push(abonosAccountsReceivable.abonosAccountsReceivable.id_account_receivable);
            ids_abonos_receivables.push(abonosAccountsReceivable.abonosAccountsReceivable.id);
            codes_output.push(account.output.cod);
        }
        let id_abono_accounts_receivable = null;
        if(ids_account_receivables.length > 0) { //A las cuentas que se realizo abono
            const abonosAccountsReceivableMultiple = await AbonosAccountsReceivableMultiple.create({
                ids_account_receivables, ids_abonos_receivables, date_abono, monto_abono, id_user: req.userAuth.id, status: true,
                type_payment,comments,account_input,id_bank,id_sucursal,id_client, status: true,codes_output
            },{ transaction: t });
            id_abono_accounts_receivable = abonosAccountsReceivableMultiple.id;
        }
        await t.commit();
        return res.status(200).json({
            ok: true,
            msg: 'Cuentas pagadas',
            id_abono_accounts_receivable
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

const payAbonoAccount = async (account,body,userAuthId,from_pay_multiple,t) => {
    try {
        const  {monto_abono, date_abono, type_payment, comments, account_input, id_bank} = body;
        let total_account_monto = Number(account.monto_abonado) + Number(monto_abono);
        let new_total_restante = Number(account.total) - Number(total_account_monto);
        
        if(new_total_restante < 0) {
            return  {ok: false, msg: `El monto abono es superior a la deuda`};
        }
        if(new_total_restante == 0){
            account.status_account = 'PAGADO';
        }
        account.monto_abonado = total_account_monto;
        account.monto_restante = new_total_restante;
        await account.save({transaction: t});

        const abonosAccountsReceivable = await AbonosAccountsReceivable.create({
            id_account_receivable:account.id, date_abono, monto_abono, total_abonado: total_account_monto,
            restante_credito: new_total_restante, id_user: userAuthId,status: true,type_payment,comments,account_input,id_bank,from_pay_multiple
        },{ transaction: t });
        //**Ingreso CAJA abono */
        const caja_small = await validaOpenCajaSmall(account.id_sucursal,userAuthId);
        const data_detail_caja = {
            date: new Date(),
            type: 'INGRESO',
            monto: monto_abono,  //TODO? PONER ID COMPRA
            description: `POR ABONO CREDITO #${account.output.cod} ABONO #${abonosAccountsReceivable.id}`,
            status: true
        }
        if(caja_small) { //caja abierta
            data_detail_caja.id_caja_small = caja_small.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } else { //abrir caja
            const new_open_caja = await CajaSmall.create({
                date_apertura: new Date(),
                monto_apertura: 0, userAuthId, id_sucursal:account.id_sucursal,
                status: 'ABIERTO'
            }, { transaction: t });
            data_detail_caja.id_caja_small = new_open_caja.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } 
        /* Ingreso historico */
        await History.create({
            id_user: userAuthId,
            description: `ABONO ${account.description}`,
            type: 'NUEVO ABONO',
            module: 'ACCOUNTS_RECEIVABLE',
            action: 'CREATE',
            id_sucursal: account.id_sucursal,
            id_reference: abonosAccountsReceivable.id,
            status: true
        }, { transaction: t }); 

        return {ok: true, abonosAccountsReceivable};
    } catch (error) {
        return  {ok: false, msg: `Error inesperado en el abono`};
    }
}

module.exports = {
    getAccountsReceivablePaginate,
    newAbonoAccountReceivable,
    deleteAbonoAccountReceivable,
    getAccountAllClient,
    payAccountMultiple,
    getAbonosAllReceivablesPaginate
};

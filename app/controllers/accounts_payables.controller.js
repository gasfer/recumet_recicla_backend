const { response, request } = require('express');
const { AccountsPayable , AbonosAccountsPayable ,sequelize, History, AbonosAccountsPayableMultiple, ViewAbonosAccountPayableAll} = require('../database/config');
const paginate = require('../helpers/paginate');
const { whereDateForType } = require('../helpers/where_range');
const { Op } = require('sequelize');
const { getNumberDecimal } = require('../helpers/company');


const getAccountsPayablePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,status_account, id_provider, id_sucursal,type_registry, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"input"."date_voucher"');
        const where = {
            [Op.and]: [
                id_provider    ? { id_provider   } : {},
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
                { association: 'provider', attributes: ['full_names']},
                { association: 'input',
                    where: { [Op.and]: [
                        type_registry ? { type_registry } : {},
                        { date_voucher: whereDate }
                    ]} ,
                    include:[  
                        { association: 'scale', attributes: ['name']},
                        { association: 'user', attributes: ['full_names','number_document']},
                    ]
                },
                // { association: 'abonosAccountsPayable', required:false,where: {status:true}, include:[  
                //     { association: 'user', attributes: ['full_names','number_document']},
                // ]},
            ]
        };
        let accountsPayable = await paginate(AccountsPayable, page, limit, type, query, optionsDb);
        const optionsSum = {
            where,  
            include: [{
                attributes: [],
                association: 'input',
                where: { [Op.and]: [
                    type_registry ? { type_registry } : {},
                    { date_voucher: whereDate }
                ]}
            }],
        };
        const total_abonados = await AccountsPayable.sum('AccountsPayable.monto_abonado', optionsSum);
        const total_restante = await AccountsPayable.sum('AccountsPayable.monto_restante', optionsSum);
        const total_account = await AccountsPayable.sum('AccountsPayable.total',optionsSum );
        for (const accountPayable of accountsPayable.data) {
            accountPayable.dataValues.abonosAccountsPayable =  await AbonosAccountsPayable.findAll({
                where: { status: true, id_account_payable: accountPayable.id},
                include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            });
        } 
        accountsPayable.totals = {
            total_abonados,
            total_restante,
            total_account
        }
        return res.status(200).json({
            ok: true,
            accountsPayable
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getAbonosAllPayablePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, id_provider, id_sucursal, filterBy, date1, date2, orderNew} = req.query;
        let {type} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"ViewAbonosAccountPayableAll"."date_abono"');
        const where = {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_provider   ? { id_provider   } : {},
                { date_abono: whereDate },
                type == 'codes_input' ?   {codes_input: {
                    [Op.contains]: [query]
                  } }: {}
            ]
        }
        if( type == 'codes_input') type = null;
        const optionsDb = {
            order: [orderNew],
            where,
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'user',attributes: ['full_names'] },
                { association: 'provider',attributes: ['full_names'] },
            ]
        };
        
        let accountsPayableAll = await paginate(ViewAbonosAccountPayableAll, page, limit, type, query, optionsDb);
        const total_abonados = await ViewAbonosAccountPayableAll.sum('ViewAbonosAccountPayableAll.monto_abono', {where});
        accountsPayableAll.totals = {
            total_abonados,
        }
        return res.status(200).json({
            ok: true,
            accountsPayableAll
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newAbonoAccountPayable = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        body.status = true;
        const { id_account_payable } = body;
        const accountsPayable = await AccountsPayable.findByPk(id_account_payable,{ transaction: t });
        const abonosAccountsPayable = await payAbonoAccount(accountsPayable,body,req.userAuth.id,false,t);
        if(abonosAccountsPayable.ok){
            await t.commit();
            return res.status(201).json({
                ok: true,
                msg: 'Abono agregado correctamente',
                ...abonosAccountsPayable
            });
        } else {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: abonosAccountsPayable.msg }],
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


const deleteAbonoAccountPayable = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_abono } = req.params;
        const abonoAccountsPayable = await AbonosAccountsPayable.findByPk(id_abono,{ transaction: t });
        await AbonosAccountsPayable.update({total_abonado:null,restante_credito:null},{ where: {id_account_payable:abonoAccountsPayable.id_account_payable},transaction: t })
        //cambio de estado del abono
        await abonoAccountsPayable.update({status:false,},{ transaction: t });
        const abono_anulado = Number(abonoAccountsPayable.monto_abono);
        //Cuenta por pagar montos modificados y estado
        const accountsPayable = await AccountsPayable.findByPk(abonoAccountsPayable.id_account_payable, { include: [{association:'input', attributes:['cod']}], transaction: t });
        accountsPayable.status_account = 'PENDIENTE';
        const newMontoAbonado = Number(accountsPayable.monto_abonado) - abono_anulado
        accountsPayable.monto_abonado = newMontoAbonado;
        accountsPayable.monto_restante = Number(accountsPayable.total) - newMontoAbonado;
        await accountsPayable.save({transaction: t});
        /*Buscar si se hizo en pago multiple*/
        const abonosMultiple = await AbonosAccountsPayableMultiple.findOne({where: {
            [Op.and]: [
                { ids_abonos_payables: {[Op.contains]: [id_abono]}}
            ]
        },transaction: t})
        if(abonosMultiple) {
            let idsAbonosPayables = abonosMultiple.ids_abonos_payables;
            let ids_account_payables = abonosMultiple.ids_account_payables;
            let codes_input = abonosMultiple.codes_input;
            idsAbonosPayables       = idsAbonosPayables.filter(id => id !== Number(id_abono));
            ids_account_payables    = ids_account_payables.filter(id => id !== Number(accountsPayable.id));
            codes_input             = codes_input.filter(code => code !== accountsPayable.input.cod);
            abonosMultiple.ids_abonos_payables  = idsAbonosPayables;
            abonosMultiple.ids_account_payables = ids_account_payables;
            abonosMultiple.codes_input          = codes_input;
            abonosMultiple.monto_abono          = Number(abonosMultiple.monto_abono) - Number(abono_anulado);
            if (idsAbonosPayables.length === 0) {
                await abonosMultiple.destroy({ transaction: t });
            } else {
                await abonosMultiple.save({ transaction: t });
            }
        }
        /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO ABONO ${accountsPayable.description}`,
            type: 'ANULO ABONO',
            module: 'ACCOUNTS_PAYABLE',
            action: 'DELETE',
            id_sucursal: accountsPayable.id_sucursal,
            id_reference: abonoAccountsPayable.id,
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

const deleteAbonoMultipleAccountPayable = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_abono_multiple } = req.params;
        const abonosAccountsPayableMultiple = await AbonosAccountsPayableMultiple.findByPk(id_abono_multiple,{ transaction: t });
        const abonosFromPayMultiple =  await AbonosAccountsPayable.findAll({ where: {id: {[Op.in]: abonosAccountsPayableMultiple.ids_abonos_payables }}},{ transaction: t });
        for (const abono_old of abonosFromPayMultiple) {
            //dar de baja abono
            await AbonosAccountsPayable.update({status:false},{ where: {id:abono_old.id},transaction: t });
            const abono_anulado = Number(abono_old.monto_abono);
            const accountsPayable = await AccountsPayable.findByPk(abono_old.id_account_payable, { transaction: t });
            accountsPayable.status_account = 'PENDIENTE';
            const newMontoAbonado = Number(accountsPayable.monto_abonado) - abono_anulado
            accountsPayable.monto_abonado = newMontoAbonado;
            accountsPayable.monto_restante = Number(accountsPayable.total) - newMontoAbonado;
            await accountsPayable.save({transaction: t});
            await History.create({
                id_user: req.userAuth.id,
                description: `ANULO ABONO ${accountsPayable.description}`,
                type: 'ANULO ABONO',
                module: 'ACCOUNTS_PAYABLE',
                action: 'DELETE',
                id_sucursal: accountsPayable.id_sucursal,
                id_reference: abono_old.id,
                status: true
            }, { transaction: t }); 
        }
        await abonosAccountsPayableMultiple.destroy({ transaction: t });
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


const getAccountAllProvider = async (req = request, res = response) => {
    try {
        const {id_provider} = req.query;
        const where = {
            [Op.and]: [
                id_provider ? { id_provider } : {},
               { status: true },
               {status_account:'PENDIENTE' }
            ]
        }
        let accountsPayable = await AccountsPayable.findAll({order: [['id', 'ASC']], where, include:[{
            attributes:['cod','date_voucher','type_registry','registry_number'],
            association:'input',
            include:[{
                attributes:['id','quantity'],
                association:'detailsInput'
            }]
        }]});
        const total_abonados = await AccountsPayable.sum('AccountsPayable.monto_abonado', {where});
        const total_restante = await AccountsPayable.sum('AccountsPayable.monto_restante', {where});
        const total_account = await AccountsPayable.sum('AccountsPayable.total',{where} );
        let total_quantity = 0;
        for (const accountPayable of accountsPayable) {
            total_quantity += accountPayable.input.detailsInput.reduce((sum, detail) => sum + Number(detail.quantity), 0);
        }
        const totals = {
            total_abonados,
            total_restante,
            total_account,
            total_accounts:accountsPayable.length,
            total_quantity
        }
        return res.status(200).json({
            ok: true,
            accountsPayable: {
                totals,
                data: accountsPayable
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
        const { id_provider, monto_abono, date_abono, type_payment, comments, account_output, id_bank, id_sucursal} = req.body;
        if (!monto_abono || isNaN(monto_abono) || !date_abono) {
            return res.status(422).json({
                ok: false,
                errors: [{ msg: 'El monto a abonar es inválido, o la fecha' }],
            });
        }
        const where = {
            [Op.and]: [
                id_provider ? { id_provider } : {},
               { status: true },
               { status_account: 'PENDIENTE'}
            ]
        }
        const accountsPayable = await AccountsPayable.findAll({order: [['id', 'ASC']], 
            where ,
            include:[  
                { association: 'input', attributes: ['cod']},
            ],
            transaction: t}
        );
        const total_restante = await AccountsPayable.sum('AccountsPayable.monto_restante', {where, transaction: t});
        let remainingAmount = parseFloat(monto_abono);  // El monto por pagar
        // Si no hay cuentas por pagar
        if (!accountsPayable || accountsPayable.length === 0) {
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

        let ids_account_payables = [];
        let ids_abonos_payables = [];
        let codes_input = [];
        //  pagar las cuentas por pagar
        for (let account of accountsPayable) {
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
            const body = req.body; //{monto_abono, date_abono, type_payment, comments, account_output, id_bank} = body;
            body.monto_abono =  newAbono;
            const abonosAccountsPayable = await payAbonoAccount(account,body,req.userAuth.id,true,t);
            if(!abonosAccountsPayable.ok) {
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [{ msg: abonosAccountsPayable.msg }],
                });
            }
            ids_account_payables.push(abonosAccountsPayable.abonosAccountsPayable.id_account_payable);
            ids_abonos_payables.push(abonosAccountsPayable.abonosAccountsPayable.id);
            codes_input.push(account.input.cod);
        }
        let id_abono_accounts_payable = null;
        if(ids_account_payables.length > 0) { //A las cuentas que se realizo abono
            const abonosAccountsPayableMultiple = await AbonosAccountsPayableMultiple.create({
                ids_account_payables, ids_abonos_payables, date_abono, monto_abono, id_user: req.userAuth.id, status: true,
                type_payment,comments,account_output,id_bank,id_sucursal,id_provider, status: true,codes_input
            },{ transaction: t });
            id_abono_accounts_payable = abonosAccountsPayableMultiple.id;
        }
        await t.commit();
        return res.status(200).json({
            ok: true,
            msg: 'Cuentas pagadas',
            id_abono_accounts_payable
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
        const  {monto_abono, date_abono, type_payment, comments, account_output, id_bank} = body;
        const decimal = await getNumberDecimal();
        let total_account_monto = Number(account.monto_abonado) + Number(monto_abono);
        let new_total_restante = Number(account.total).toFixed(decimal) - Number(total_account_monto).toFixed(decimal)
        
        if(new_total_restante < 0) {
            return  {ok: false, msg: `El monto abono es superior a la deuda`};
        }
        if(new_total_restante == 0){
            account.status_account = 'PAGADO';
        }
        account.monto_abonado = total_account_monto;
        account.monto_restante = new_total_restante;
        await account.save({transaction: t});

        const abonosAccountsPayable = await AbonosAccountsPayable.create({
            id_account_payable:account.id, date_abono, monto_abono, total_abonado: total_account_monto,
            restante_credito: new_total_restante, id_user: userAuthId,status: true,type_payment,comments,account_output,id_bank,from_pay_multiple
        },{ transaction: t });
        /* Ingreso historico */
        await History.create({
            id_user: userAuthId,
            description: `ABONO ${account.description}`,
            type: 'NUEVO ABONO',
            module: 'ACCOUNTS_PAYABLE',
            action: 'CREATE',
            id_sucursal: account.id_sucursal,
            id_reference: abonosAccountsPayable.id,
            status: true
        }, { transaction: t }); 

        return {ok: true, abonosAccountsPayable};
    } catch (error) {
        return  {ok: false, msg: `Error inesperado en el abono`};
    }
}

module.exports = {
    getAccountsPayablePaginate,
    newAbonoAccountPayable,
    deleteAbonoAccountPayable,
    getAccountAllProvider,
    payAccountMultiple,
    getAbonosAllPayablePaginate,
    deleteAbonoMultipleAccountPayable,
};

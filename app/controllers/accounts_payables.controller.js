const { response, request } = require('express');
const { AccountsPayable , AbonosAccountsPayable ,sequelize, History} = require('../database/config');
const paginate = require('../helpers/paginate');
const { whereDateForType } = require('../helpers/where_range');
const { Op } = require('sequelize');


const getAccountsPayablePaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,status_account, id_provider, id_sucursal,type_registry, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"AccountsPayable"."createdAt"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_provider    ? { id_provider   } : {},
                    id_sucursal   ? { id_sucursal   } : {},
                    status_account ? { status_account   } : {},
                    { status: true },
                    { createdAt: whereDate }
                ]
            },
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'provider', attributes: ['full_names']},
                { association: 'input',
                    where: { [Op.and]: [
                        type_registry ? { type_registry } : {},
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
        for (const accountPayable of accountsPayable.data) {
            accountPayable.dataValues.abonosAccountsPayable =  await AbonosAccountsPayable.findAll({
                where: { status: true, id_account_payable: accountPayable.id},
                include:[  
                    { association: 'user', attributes: ['full_names','number_document']},
                ]
            });
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

const newAbonoAccountPayable = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const body = req.body;
        body.status = true;
        const { id_account_payable, monto_abono, date_abono } = body;
        const accountsPayable = await AccountsPayable.findByPk(id_account_payable,{ transaction: t });
        let total_account_monto = Number(accountsPayable.monto_abonado) + Number(monto_abono);
        let new_total_restante = Number(accountsPayable.total) - Number(total_account_monto);
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
            accountsPayable.status_account = 'PAGADO';
        }
        accountsPayable.monto_abonado = total_account_monto;
        accountsPayable.monto_restante = new_total_restante;
        await accountsPayable.save({transaction: t});

        const abonosAccountsPayable = await AbonosAccountsPayable.create({
            id_account_payable, date_abono, monto_abono, total_abonado: total_account_monto,
            restante_credito: new_total_restante, id_user: req.userAuth.id,status: true
        },{ transaction: t });
        /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `ABONO ${accountsPayable.description}`,
            type: 'NUEVO ABONO',
            module: 'ACCOUNTS_PAYABLE',
            action: 'CREATE',
            id_sucursal: accountsPayable.id_sucursal,
            id_reference: abonosAccountsPayable.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Abono agregado correctamente',
            abonosAccountsPayable
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


const deleteAbonoAccountPayable = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_abono } = req.params;
        const abonoAccountsPayable = await AbonosAccountsPayable.findByPk(id_abono,{ transaction: t });
        //validar solo puede anular el ultimo abono
        const maxIdAbono = await AbonosAccountsPayable.max('id',{ where: {id_account_payable:abonoAccountsPayable.id_account_payable,status:true},transaction: t});
        if(id_abono != maxIdAbono){
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `Por favor, tenga en cuenta que solo puede anular el último abono realizado.`}],
            });
        }
        //cambio de estado del abono
        await abonoAccountsPayable.update({status:false},{ transaction: t });
        const abono_anulado = Number(abonoAccountsPayable.monto_abono);
        //Cuenta por pagar montos modificados y estado
        const accountsPayable = await AccountsPayable.findByPk(abonoAccountsPayable.id_account_payable,{ transaction: t });
        accountsPayable.status_account = 'PENDIENTE';
        const newMontoAbonado = Number(accountsPayable.monto_abonado) - abono_anulado
        accountsPayable.monto_abonado = newMontoAbonado;
        accountsPayable.monto_restante = Number(accountsPayable.total) - newMontoAbonado;
        await accountsPayable.save({transaction: t});
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

module.exports = {
    getAccountsPayablePaginate,
    newAbonoAccountPayable,
    deleteAbonoAccountPayable
};

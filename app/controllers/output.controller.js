const { request, response } = require("express")
const { Output, sequelize, History ,Stock,OutputBig, Kardex,DetailsOutput,AccountsReceivable,AbonosAccountsReceivable,Sequelize,DetailsCajaSmall,CajaSmall} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { validaOpenCajaSmall } = require("../middlewares/validators/caja_small");
const { returnDataKardexOutput, returnDataKardexInput, returnDataAfterUpdateKardex } = require("../helpers/kardex");

const getOutputsPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,type_registry,type_output,id_client,type_pay, id_sucursal, id_storage, status, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Output"."createdAt"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_sucursal   ? { id_sucursal } : {},
                    id_storage    ? { id_storage  } : {},
                    type_pay      ? { type_output:type_pay } : {},
                    type_output   ? { voucher:type_output } : {},
                    type_registry ? { type_registry } : {},
                    id_client     ? { id_client   } : {},
                    { status },
                    { createdAt: whereDate }
                ]
            },
            include: [ 
                { association: 'client' },
                { association: 'sucursal',attributes: ['name'] },
                { association: 'storage',attributes: ['name'] },
                { association: 'scale', attributes: ['name']},
                { association: 'user', attributes: ['full_names','number_document']},
                { association: 'bank'},
                { association: 'detailsOutput', attributes: {exclude: ['id','id_output','id_product','status','createdAt','updatedAt']}, 
                    include: [{ association: 'product', include: [{association: 'category'},{association: 'unit'},{association: 'prices'}],
                                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']},}]
                },
                { association: 'outputBig', include: [
                    { association: 'chauffeur', include: [{association: 'trasport_company'}]},
                    { association: 'cargo_truck'}
                ]},
                { association: 'accounts_receivable', include:[ {association: 'abonosAccountsReceivable', required:false,where: {status:true}}]},
            ]
        };
        let outputs = await paginate(Output, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            outputs
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newOutput = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { output_data, output_details, output_big } = req.body;
        const { id_sucursal, id_storage, number_registry } = output_data;
        output_data.id_user = req.userAuth.id;
        output_data.date_output = new Date();
        output_data.type_output = output_data.pay_to_credit ? 'CREDITO' : 'CONTADO';
        /**Crear venta y cod */
        const output = await Output.create(output_data, { transaction: t });
        const count_outputs = await Output.count({ where: {id_sucursal}, transaction: t });
        const cod = get_num_request('V',count_outputs,5);
        output.cod = cod;
        await output.save({transaction: t});
        const id_output = output.id;
        /** Venta por mayor */
        if(output_big && output_data.voucher != 'MENOR'){ //SOLO SI ES INDISTINTO A VENTA POR MENOR GUARDAMOS LO DE MAYOR
            output_big.id_output = id_output;
            await OutputBig.create(output_big, { transaction: t });
        }
        /*  detalles de la venta */
        let listProductNotStock = [];
        for (const detail of output_details) {
            detail.id_output = id_output;
            await DetailsOutput.create(detail,{ transaction: t });        
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexOutput(`VENTA ${output_data.voucher} #${cod}`,output_data.id_client,detail.price,null,number_registry,old_kardex,detail,id_output, id_sucursal, id_storage );
            await Kardex.create(data_new,{ transaction: t });
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                include: [{association:'product', required:true, attributes: ['name','cod']}],
                lock: true,
                transaction: t
            });
            //??ERROR STOCK INSUFICIENTE
            if(stock.stock < detail.quantity){
                listProductNotStock.push(
                    { msg: `${stock.product.cod} - ${stock.product.name} no tiene suficiente stock.`}
                );
            }
            stock.stock = Number(stock.stock) - Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        //??MENSAJE DE STOCK INSUFICIENTE
        if(listProductNotStock.length > 0) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: listProductNotStock,
            });
        } 
         /* Ingreso si es venta a crédito */
        let description_caja = `POR VENTA #${cod}`; 
        if(output_data.pay_to_credit){//si es venta a crédito
            const monto_restante = Number(output_data.total) - Number(output_data.on_account);
            const output_credit = await AccountsReceivable.create({
                id_output, id_client: output_data.id_client,
                description: `POR VENTA #${cod}`,
                date_credit: new Date(),
                total: output_data.total,
                monto_abonado: output_data.on_account,
                status_account: monto_restante === 0 ? 'PAGADO' : 'PENDIENTE',
                monto_restante,
                id_sucursal,
                status: true,
            }, { transaction: t });
            const count_accounts_receivable = await AccountsReceivable.count({ where: {id_sucursal}, transaction: t });
            const cod_credit = get_num_request('CC',count_accounts_receivable,5);
            output_credit.cod = cod_credit;
            await output_credit.save({transaction: t});
            let new_abono;
            if(Number(output_data.on_account) > 0){
                new_abono = await AbonosAccountsReceivable.create({
                    id_account_receivable: output_credit.id,
                    date_abono: new Date(),
                    monto_abono: output_data.on_account,
                    total_abonado: output_data.on_account,
                    restante_credito: Number(output_data.total) - Number(output_data.on_account),
                    id_user: req.userAuth.id,
                    status:  true,
                }, { transaction: t });
                description_caja = `POR ABONO CREDITO #${output_credit.cod} ABONO #${new_abono.id}`;
            }
        }
        //**INGRESO CAJA - ABRIR AUTO */
        const caja_small = await validaOpenCajaSmall(id_sucursal,output_data.id_user);
        const data_detail_caja = {
            date: new Date(),
            type: 'INGRESO',
            type_payment: output_data?.type_payment, 
            id_bank: output_data?.id_bank,
            account_payment: output_data?.account_output, 
            monto: output_data.pay_to_credit ? output_data.on_account : output_data.total,
            description: description_caja,
            status: true
        }
        if(caja_small) { //caja abierta
            data_detail_caja.id_caja_small = caja_small.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } else { //abrir caja
            const new_open_caja = await CajaSmall.create({
                date_apertura: new Date(),
                monto_apertura: 0, id_user:output_data.id_user, id_sucursal,
                status: 'ABIERTO'
            }, { transaction: t });
            data_detail_caja.id_caja_small = new_open_caja.id;
            await DetailsCajaSmall.create(data_detail_caja, { transaction: t });
        } 
         /* Ingreso histórico */
        await History.create({
            id_user: req.userAuth.id,
            description: `CREO LA VENTA CON #${cod}`,
            type: 'NUEVA VENTA',
            module: 'OUTPUT',
            action: 'CREATE',
            id_sucursal,
            id_reference: output.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Venta creada correctamente',
            id_output,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR VENTA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateOutput = async (req = request, res = response) => {
    const t = await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });
    try {
        const { id_output } = req.params;
        const { output_data, output_details, output_big } = req.body;
        const { id_sucursal, id_storage, registry_number } = output_data;
        output_data.id_user = req.userAuth.id;
        output_data.type_output =  output_data.pay_to_credit ? 'CREDITO' : 'CONTADO';
        const output_old = await Output.findByPk(id_output,{
            include: [ 
                { association: 'detailsOutput'},
                { association: 'kardex'},
                { association: 'accounts_receivable', include:[ {association: 'abonosAccountsReceivable', required:false,where: {status:true}}]},
            ],
            transaction: t
        });
        //** Reset details and kardex and stock and update Output */
        await Output.update(output_data,{where:{id: id_output}, transaction: t});
        await DetailsOutput.destroy({where: {id: [...output_old.detailsOutput.map(resp=>resp.id)]}, transaction: t });   
        //** Venta por mayor *//
        await OutputBig.destroy({where: {id_output}, transaction: t });   
        if(output_big && output_data.voucher != 'MENOR'){ //SOLO SI ES INDISTINTO A VENTA POR MENOR GUARDAMOS LO DE MAYOR
            output_big.id_output = id_output;
            await OutputBig.create(output_big, { transaction: t });
        }
        //* Destroy kardex */
        const kardexIdes = [...output_old.kardex.map(resp => resp.id)];
        const minKardexId = Math.min(...kardexIdes);
        await Kardex.destroy({where: {id: kardexIdes}, transaction: t });   
        //**Eliminar y Agregar los kardex nuevamente que son mayores al del primer kardex eliminado*/
        const kardex_afters = await Kardex.findAll({
            where: { id: { [Op.gt]: minKardexId }, status: true },// Filtrar por IDs mayores que el de la fila kardex encontrada
            transaction: t
        }); 
        //**Elimino los demas ya que se modifican los saldos */
        await Kardex.destroy({ where: { id: { [Op.gte]: minKardexId },status: true }, transaction: t }); 
        //*Descuento stock*/
        for (const detail_old of output_old.detailsOutput){
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail_old.id_product, id_sucursal:output_old.id_sucursal, id_storage:output_old.id_storage, status: true },
                lock: true,
                transaction: t
            });
            if(stock) {
                stock.stock = Number(stock.stock) + Number(detail_old.quantity);
                await stock.save({ transaction: t });
            }
        }
        //*** New details and kardex and stock */
        let listProductNotStock = [];
        for (const detail of output_details) {
            detail.id_output = id_output;
            await DetailsOutput.create(detail,{ transaction: t });        
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexOutput(`VENTA ${output_data.voucher} #${output_old.cod}`,output_data.id_client,detail.price,null,registry_number,old_kardex,detail,id_output, id_sucursal, id_storage );
            await Kardex.create(data_new,{ transaction: t });
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                include: [{association:'product', required:true, attributes: ['name','cod']}],
                lock: true,
                transaction: t
            });
            //??ERROR STOCK INSUFICIENTE
            if(stock.stock < detail.quantity){
                listProductNotStock.push(
                    { msg: `${stock.product.cod} - ${stock.product.name} no tiene suficiente stock.`}
                );
            }
            stock.stock = Number(stock.stock) - Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        //??MENSAJE DE STOCK INSUFICIENTE
        if(listProductNotStock.length > 0) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: listProductNotStock,
            });
        } 
        //**Agregar los kardex nuevamente los eliminados*/
        for (const kardex_after of kardex_afters){
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:kardex_after.id_product, id_sucursal:kardex_after.id_sucursal, id_storage:kardex_after.id_storage, status: true },
                lock: true,
                transaction: t
            });
            const data_kardex = returnDataAfterUpdateKardex(kardex_after,old_kardex);
            await Kardex.create(data_kardex,{ transaction: t });
        }
        //**Update abono input credit */
        /** si la compra era a crédito
         * Por ende validamos que no se tengan varios abonos. si son varios. no podemos editar o anular abonos.
         */
        if(output_old.type_output == 'CREDITO' && output_old?.accounts_receivable?.abonosAccountsReceivable?.length > 1) {
            if(output_old.total != output_data.total ){
                //**no se podría modificar la compra por que se tienen varios abonos.
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [
                        { msg: `La venta no puede ser modificada, Se tienen varios abonos al crédito, y el total fue modificado` },
                        { msg: `Anule los abonos a esta venta` },
                    ],
                });
            }
            //si modifico el monto a cuenta, pero como tiene varios abonos no editamos ni agregamos. //Función en cuentas por pagar
        } else {
            /** Buscamos el credito y si existe lo eliminamos y procedemos a crear otro, Si existe*/
            const accountsReceivable_old = await AccountsReceivable.findByPk(output_old?.accounts_receivable?.id,{transaction: t });
            if(accountsReceivable_old){
                await AbonosAccountsReceivable.destroy({where: { id_account_receivable: accountsReceivable_old.id}, transaction: t });
                await AccountsReceivable.destroy({where: { id: accountsReceivable_old.id }, transaction: t });
            }
            let description_caja = `POR VENTA #${output_old.cod}`; 
            //**New input credit */
            if(output_data.pay_to_credit){
                const monto_restante = Number(output_data.total) - Number(output_data.on_account);
                const output_credit = await AccountsReceivable.create({
                    id_output, id_client: output_data.id_client,
                    description: `POR VENTA #${output_old.cod}`,
                    date_credit: new Date(),
                    total: output_data.total,
                    monto_abonado: output_data.on_account,
                    status_account: monto_restante === 0 ? 'PAGADO' : 'PENDIENTE',
                    monto_restante,
                    id_sucursal,
                    status: true,
                }, { transaction: t });
                const count_accounts_receivable = await AccountsReceivable.count({ where: {id_sucursal}, transaction: t });
                const cod_credit = get_num_request('CC',count_accounts_receivable,5);
                output_credit.cod = cod_credit;
                await output_credit.save({transaction: t});
                let new_abono;
                if(Number(output_data.on_account) > 0){
                    new_abono = await AbonosAccountsReceivable.create({
                        id_account_receivable: output_credit.id,
                        date_abono: new Date(),
                        monto_abono: output_data.on_account,
                        total_abonado: output_data.on_account,
                        restante_credito: Number(output_data.total) - Number(output_data.on_account),
                        id_user: req.userAuth.id,
                        status:  true,
                    }, { transaction: t });
                    description_caja = `POR ABONO CREDITO #${output_credit.cod} ABONO #${new_abono.id}`;
                }
            }
            const data_detail_caja = {
                type_payment: output_data?.type_payment, 
                id_bank: output_data?.id_bank,
                account_payment: output_data?.account_output, 
                monto: output_data.pay_to_credit ? output_data.on_account : output_data.total,
                description: description_caja,
            }
            await DetailsCajaSmall.update(data_detail_caja, {
                where: { description: output_old.type_output == 'CREDITO' && output_old?.accounts_receivable?.abonosAccountsReceivable[0]?.id ? `POR ABONO CREDITO #${accountsReceivable_old.cod} ABONO #${output_old?.accounts_receivable?.abonosAccountsReceivable[0].id}`  :`POR VENTA #${output_old.cod}`},
                transaction: t
            });
        }
         /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `MODIFICO VENTA CON #${output_old.cod}`,
            type: 'EDITO VENTA',
            module: 'OUTPUT',
            action: 'UPDATE',
            id_sucursal,
            id_reference: id_output,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Venta modificada correctamente',
            id_output
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR UPDATE VENTA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const anularOutput = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const {id_output} = req.params;
        const output_anular = await Output.findOne({
            where: { id:id_output, status:'ACTIVE' },
            include: [{association: 'detailsOutput'}], transaction: t
        });
        output_anular.status = 'INACTIVE';   
        await output_anular.save({transaction: t});
        const { id_sucursal, id_storage, } = output_anular;
        for (const detail of output_anular.detailsOutput) {
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            detail.total = Number(detail.cost) * Number(detail.quantity);
            const data_new = returnDataKardexInput(`ANULACIÓN VENTA #${output_anular.cod}`,null,null,null, old_kardex,detail,null, null, id_sucursal, id_storage, id_output);
            await Kardex.create(data_new,{ transaction: t });
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            stock.stock = Number(stock.stock) + Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        //**Cuenta por pagar */
        const accountReceivable = await AccountsReceivable.findOne({
            where: {id_output, status: true}, 
            include: [{association: 'abonosAccountsReceivable'}],transaction: t
        });
        //**ANULAR CAJA y abonos*/
        await DetailsCajaSmall.update({ status: false }, {
            where: { description: `POR VENTA #${output_anular.cod}`},
            transaction: t
        });
        for (const abono of accountReceivable?.abonosAccountsReceivable ?? []) {
            await DetailsCajaSmall.update({ status: false }, {
                where: { description: `POR ABONO CREDITO #${accountReceivable.cod} ABONO #${abono.id}`},
                transaction: t
            });
        }
        //**anula cuenta por pagar y sus abonos, si existe */
        await AccountsReceivable.update({status:false},{where: {id_output, status: true}, transaction: t});
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO LA VENTA CON #${output_anular.cod}`,
            type: 'ANULO VENTA',
            module: 'OUTPUT',
            action: 'DELETE',
            id_sucursal,
            id_reference: output_anular.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: "Venta anulada correctamente", 
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ANULAR VENTA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });  
    }
}

module.exports = {
    getOutputsPaginate,
    newOutput,
    updateOutput,
    anularOutput
}
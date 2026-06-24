const { response, request } = require('express');
const { Input, sequelize, History ,Stock,DetailsInput,AccountsPayable,AbonosAccountsPayable, Sequelize,Product,} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { fileMoveAndRemoveOld } = require('../helpers/file-upload');
const path = require('path');
const fs = require('fs');

const getInputFindOne = async (req = request, res = response) => {
    try {
        const { id_input } = req.params;
        const optionsDb = {
            include: [ 
                { association: 'provider' },
                { association: 'sucursal',attributes: ['name'] },
                { association: 'storage',attributes: ['name'] },
                { association: 'scale', attributes: ['name']},
                { association: 'user', attributes: ['full_names','number_document']},
                { association: 'bank'},
                { association: 'detailsInput', attributes: {exclude: ['id','id_input','id_product','status','createdAt','updatedAt']}, 
                    include: [{ association: 'product', include: [{association: 'category'},{association: 'unit'}],
                                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']},}]
                },
                { association: 'accounts_payable', include:[ {association: 'abonosAccountsPayable', required:false,where: {status:true}}]},
            ]
        };
        let input = await Input.findByPk(id_input, optionsDb); 
        return res.status(200).json({
            ok: true,
            input,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getInputsPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type, id_sucursal, id_storage, type_pay, type_registry, 
                id_provider, status, filterBy, date1, date2, orderNew, referral_sources, id_type_provider,
                old_customer, with_pickup
            } = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Input"."date_voucher"');
        const whereDateSum = whereDateForType(filterBy,date1, date2, '"input"."date_voucher"');
        const where = {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage    } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                { status },
                { date_voucher: whereDate },
                referral_sources ? { referral_sources } : {},
                old_customer ? { old_customer: old_customer == 'SI' } : {},
                with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
            ]
        };
        const whereSum = {
            [Op.and]: [
                id_sucursal   ? { id_sucursal   } : {},
                id_storage    ? { id_storage    } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                { status },
                { date_voucher: whereDateSum },
                referral_sources ? { referral_sources } : {},
                old_customer ? { old_customer: old_customer == 'SI' } : {},
                with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
            ]
        };
        const optionsDb = {
            order: [orderNew],
            where,
            include: [ 
                {
                    association: 'provider',
                    where: id_type_provider ? { id_type_provider } : {},
                    include: [{association: 'type', attributes: ['name']}],
                },
                  
                { association: 'sucursal',attributes: ['name'] },
                { association: 'storage',attributes: ['name'] },
                { association: 'scale', attributes: ['name']},
                { association: 'user', attributes: ['full_names','number_document']},
                { association: 'bank'},
                { association: 'detailsInput', attributes: {exclude: ['id','id_input','id_product','status','createdAt','updatedAt']}, 
                    include: [{ association: 'product', include: [{association: 'category'},{association: 'unit'}],
                                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']},}]
                },
                { association: 'accounts_payable', include:[ {association: 'abonosAccountsPayable', required:false,where: {status:true}}]},
            ]
        };
        let inputs = await paginate(Input, page, limit, type, query, optionsDb); 
        for (const input of inputs.data) {
            input.dataValues.total_quantity = input.detailsInput.reduce((acc, item) => acc + Number(item.quantity), 0);
        }
        const totalInput = await Input.sum('total', {where});
        
        const totalQuantity = await DetailsInput.sum('quantity', {
            include: [
                {
                    attributes: [],
                    association: 'input',
                    where: whereSum
                }
            ]
        });
        inputs.totals = {
            totalInput,
            totalQuantity
        }
        return res.status(200).json({
            ok: true,
            inputs,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newInput = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { input_data, input_details } = req.body;
        const { id_sucursal, id_provider, id_storage,registry_number, type_registry } = input_data; //,registry_number(validar_ num boleta)
        //number default, not ficha
        if(type_registry === 'SIN FICHA') {
            const lastInput = await Input.findOne({
                where: { 
                    type_registry: 'SIN FICHA',
                    registry_number: { [Op.like]: 'SF-%'}
                },
                order: [['registry_number', 'DESC']],
                transaction: t
            });
            let nextNumber = 1;
            if (lastInput && lastInput.registry_number) {
                const lastNumber = parseInt(lastInput.registry_number.split('-')[1]);
                nextNumber = lastNumber + 1;
            }
            input_data.registry_number = get_num_request('SF-',nextNumber,5);
        }

        input_data.id_user = req.userAuth.id;
        input_data.type =  input_data.pay_to_credit ? 'CREDITO' : 'CONTADO';
        const input = await Input.create(input_data, { transaction: t });
        const count_inputs = await Input.count({ where: {id_sucursal}, transaction: t });
        const cod = get_num_request('COMP',count_inputs,5);
        input.cod = cod;
        await input.save({transaction: t});
        const id_input = input.id;
        /* Ingreso de detalles de la compra */
        for (const detail of input_details) {
            detail.id_input = id_input;
            await DetailsInput.create(detail,{ transaction: t });
            //**ACTUALIZAR COSTO PRODUCTO */
            //await Product.update({costo: detail.cost},{where: {id:detail.id_product},transaction: t});
            //**ACTUALIZAR STOCK */
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            if(!stock) {
                await Stock.create({
                    stock_min: 1, stock: detail.quantity,
                    id_product: detail.id_product, id_sucursal, id_storage,
                    status: true,
                },{ transaction: t })
            } else {
                stock.stock = Number(stock.stock) + Number(detail.quantity);
                await stock.save({ transaction: t });
            }
        }
         /* Ingreso si es compra a credito */
        if(input_data.pay_to_credit){//si es compra a credito
            const monto_restante = Number(input_data.total) - Number(input_data.on_account);
            const input_credit = await AccountsPayable.create({
                id_input, id_provider: input_data.id_provider,
                description: `POR COMPRA #${cod}`,
                date_credit: new Date(),
                total: input_data.total,
                monto_abonado: input_data.on_account,
                status_account: monto_restante === 0 ? 'PAGADO' : 'PENDIENTE',
                monto_restante,
                id_sucursal,
                status: true,
            }, { transaction: t });
            const count_accounts_payable = await AccountsPayable.count({ where: {id_sucursal}, transaction: t });
            const cod_credit = get_num_request('CP',count_accounts_payable,5);
            input_credit.cod = cod_credit;
            await input_credit.save({transaction: t});
            if(Number(input_data.on_account) > 0){
                await AbonosAccountsPayable.create({
                    id_account_payable :input_credit.id,
                    date_abono :new Date(),
                    monto_abono :input_data.on_account,
                    total_abonado :input_data.on_account,
                    restante_credito :Number(input_data.total) - Number(input_data.on_account),
                    id_user :req.userAuth.id,
                    status : true,
                }, { transaction: t });
            }
        }
         /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `CREO LA COMPRA CON #${cod}`,
            type: 'NUEVA COMPRA',
            module: 'INPUT',
            action: 'CREATE',
            id_sucursal,
            id_reference: input.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Compra creada correctamente',
            id_input,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR COMPRA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateInput = async (req = request, res = response) => {
    const t = await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });
    try {
        const { id_input } = req.params;
        const { input_data, input_details } = req.body;
        const { id_sucursal, id_provider, id_storage, registry_number, type_registry } = input_data;
        input_data.id_user = req.userAuth.id;
        input_data.type =  input_data.pay_to_credit ? 'CREDITO' : 'CONTADO';
        const input_old = await Input.findByPk(id_input,{
            include: [ 
                { association: 'provider'},
                { association: 'scale'},
                { association: 'user'},
                { association: 'bank'},
                { association: 'detailsInput'},
                { association: 'accounts_payable', include:[ {association: 'abonosAccountsPayable', required:false,where: {status:true}}]},
            ],
            transaction: t
        });
        if (type_registry === 'SIN FICHA') {
            if (!input_old.registry_number || input_old.type_registry != 'SIN FICHA') {
                const lastInput = await Input.findOne({
                    where: { 
                        type_registry: 'SIN FICHA',
                        registry_number: { [Op.like]: 'SF-%'}
                    },
                    order: [['registry_number', 'DESC']],
                    transaction: t
                });
                
                let nextNumber = 1;
                if (lastInput && lastInput.registry_number) {
                    const lastNumber = parseInt(lastInput.registry_number.split('-')[1]);
                    nextNumber = lastNumber + 1;
                }
                
                input_data.registry_number = get_num_request('SF-',nextNumber,5);
            } else {
                input_data.registry_number = input_old.registry_number;
            }
        }
        //** Reset details and stock and update input */
        await Input.update(input_data,{where:{id: id_input}, transaction: t});
        await DetailsInput.destroy({where: {id: [...input_old.detailsInput.map(resp=>resp.id)]}, transaction: t });   
        //*Descuento stock*/
        for (const detail_old of input_old.detailsInput){
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail_old.id_product, id_sucursal:input_old.id_sucursal, id_storage:input_old.id_storage, status: true },
                lock: true,
                transaction: t
            });
            if(stock) {
                stock.stock = Number(stock.stock) - Number(detail_old.quantity);
                await stock.save({ transaction: t });
            }
        }
        //*** New details and stock */
        for (const detail of input_details) {
            detail.id_input = id_input;
            await DetailsInput.create(detail,{ transaction: t });   
             //**ACTUALIZAR COSTO PRODUCTO */
            // await Product.update({costo: detail.cost},{where: {id:detail.id_product},transaction: t});     
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            if(!stock) {
                await Stock.create({
                    stock_min: 1, stock: detail.quantity,
                    id_product: detail.id_product, id_sucursal, id_storage,
                    status: true,
                },{ transaction: t })
            } else {
                stock.stock = Number(stock.stock) + Number(detail.quantity);
                await stock.save({ transaction: t });
            }
        }
        //**Update abono input credit */
        /** si la compra era a crédito
         * Por ende validamos que no se tengan varios abonos. si son varios. no podemos editar o anular abonos.
         */
        if(input_old.type == 'CREDITO' && input_old?.accounts_payable?.abonosAccountsPayable?.length > 1) {
            if(input_old.total != input_data.total ){
                //**no se podría modificar la compra por que se tienen varios abonos.
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [
                        { msg: `La compra no puede ser modificado, Se tienen varios abonos al crédito, y el total fue modificado` },
                        { msg: `Anule los abonos a esta compra` },
                    ],
                });
            }
            //si modifico el monto a cuenta, pero como tiene varios abonos no editamos ni agregamos. //Función en cuentas por pagar
        } else {
            /** Buscamos el credito y si existe lo eliminamos y procedemos a crear otro, Si existe*/
            const accountsPayable_old = await AccountsPayable.findByPk(input_old?.accounts_payable?.id,{transaction: t });
            if(accountsPayable_old){
                await AbonosAccountsPayable.destroy({where: { id_account_payable: accountsPayable_old.id}, transaction: t });
                await AccountsPayable.destroy({where: { id: accountsPayable_old.id }, transaction: t });
            }
            //**New input credit */
            if(input_data.pay_to_credit){
                const monto_restante = Number(input_data.total) - Number(input_data.on_account);
                const input_credit = await AccountsPayable.create({
                    id_input, id_provider: input_data.id_provider,
                    description: `POR COMPRA #${input_old.cod}`,
                    date_credit: new Date(),
                    total: input_data.total,
                    monto_abonado: input_data.on_account,
                    status_account: monto_restante === 0 ? 'PAGADO' : 'PENDIENTE',
                    monto_restante,
                    id_sucursal,
                    status: true,
                }, { transaction: t });
                const count_accounts_payable = await AccountsPayable.count({ where: {id_sucursal}, transaction: t });
                const cod_credit = get_num_request('CP',count_accounts_payable,5);
                input_credit.cod = cod_credit;
                await input_credit.save({transaction: t});
                if(Number(input_data.on_account) > 0){
                    await AbonosAccountsPayable.create({
                        id_account_payable :input_credit.id,
                        date_abono :new Date(),
                        monto_abono :input_data.on_account,
                        total_abonado :input_data.on_account,
                        restante_credito :Number(input_data.total) - Number(input_data.on_account),
                        id_user :req.userAuth.id,
                        status : true,
                    }, { transaction: t });
                }
            }
        }
         /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `MODIFICO COMPRA CON #${input_old.cod}`,
            type: 'EDITO COMPRA',
            module: 'INPUT',
            id_sucursal,
            action: 'UPDATE',
            id_reference: id_input,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Compra modificada correctamente',
            id_input
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR UPDATE COMPRA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const anularInput = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const {id_input} = req.params;
        const input_anular = await Input.findOne({
            where: { id:id_input, status:'ACTIVE' },
            include: [{association: 'detailsInput'}], transaction: t
        });
        input_anular.status = 'INACTIVE';
        await input_anular.save({transaction: t});
        const { id_sucursal, id_storage, } = input_anular;
        for (const detail of input_anular.detailsInput) {
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            stock.stock = Number(stock.stock) - Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        await AccountsPayable.update({status:false},{where: {id_input, status: true}, transaction: t});
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO LA COMPRA CON #${input_anular.cod}`,
            type: 'ANULO COMPRA',
            module: 'INPUT',
            action: 'DELETE',
            id_sucursal,
            id_reference: input_anular.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: "Compra anulada correctamente", 
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ANULAR COMPRA: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });  
    }
}

const uploadFileVoucher = async (req, res) => {
    const { idInput } = req.query;
    const { keyFile, file } = req;
    
    // Ensure uploads/vouchers directory exists
    const baseUploads = process.env.RESOURCES_PATH 
        ? path.resolve(process.env.RESOURCES_PATH) 
        : path.join(__dirname, '../../uploads');
    const uploadDirectory = path.join(baseUploads, 'vouchers');
    if (!fs.existsSync(uploadDirectory)) {
        fs.mkdirSync(uploadDirectory, { recursive: true });
    }

    try {
        let inputDB = await Input.findByPk(idInput);
        if (!inputDB) {
            return res.status(404).json({
                ok: false,
                msg: `La compra con ID ${idInput} no existe`,
            });
        }
        
        const extensions = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG', 'webp', 'WEBP', 'pdf', 'PDF'];
        inputDB.payment_voucher = await fileMoveAndRemoveOld(file, inputDB.payment_voucher || '', idInput, 'vouchers', extensions);
        await inputDB.save();
        
        return res.json({
            ok: true,
            msg: `Comprobante subido correctamente`,
            payment_voucher: inputDB.payment_voucher
        });
    } catch (error) {
        console.log(error);
        return res.status(422).json({
            ok: false,
            errors: [{ msg: `No se pudo subir tu comprobante - ${error}` }]
        });
    }
};

module.exports = {
    getInputsPaginate,
    getInputFindOne,
    newInput,
    updateInput,
    anularInput,
    uploadFileVoucher
};

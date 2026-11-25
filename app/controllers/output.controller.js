const { request, response } = require("express")
const { Output, sequelize, History ,Stock,Product,OutputBig,DetailsOutput,AccountsReceivable,AbonosAccountsReceivable,Sequelize,DetailsCajaSmall,CajaSmall,CjLedger} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { outputListOrder } = require('../services/output-report-query.service');
const { validaOpenCajaSmall } = require("../middlewares/validators/caja_small");
const { postOperationalMovement } = require('../services/caja-ledger.service');
const { hasAvailableStock, validateOutgoingDetails } = require('../services/stock-availability.service');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const { applyDerivedStockEffect } = require('../services/inventory-posting.service');
const { getStockKardexIntegrity, verifyLocationsIntegrityPreserved } = require('../services/stock-kardex-integrity.service');
const { KILOGRAM_UNITS, isKilogramUnit } = require('../helpers/kilogram-units');
const { exactAdd } = require('../helpers/number-formatter');

const valuedKardex = new ValuedKardexService();


const getOutputFindOne = async (req = request, res = response) => {
    try {
        const { id_output } = req.params;
        const optionsDb = {
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
        let output = await Output.findByPk(id_output, optionsDb); 
        return res.status(200).json({
            ok: true,
            output
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getOutputsPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,type_registry,type_output,id_client,type_pay, id_sucursal, id_storage, status, filterBy, date1, date2} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Output"."date_output"');
        const whereDateSum = whereDateForType(filterBy,date1, date2, '"output"."date_output"');
        const where = {
            [Op.and]: [
                id_sucursal   ? { id_sucursal } : {},
                id_storage    ? { id_storage  } : {},
                type_pay      ? { type_output:type_pay } : {},
                type_output   ? { voucher:type_output } : {},
                type_registry ? { type_registry } : {},
                id_client     ? { id_client   } : {},
                { status },
                { date_output: whereDate }
            ]
        }
        const whereSum = {
            [Op.and]: [
                id_sucursal   ? { id_sucursal } : {},
                id_storage    ? { id_storage  } : {},
                type_pay      ? { type_output:type_pay } : {},
                type_output   ? { voucher:type_output } : {},
                type_registry ? { type_registry } : {},
                id_client     ? { id_client   } : {},
                { status },
                { date_output: whereDateSum }
            ]
        }
        const optionsDb = {
            order: outputListOrder(req.query, sequelize),
            where,
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
        for (const output of outputs.data) {
            output.dataValues.total_quantity = Number((output.detailsOutput || [])
                .filter(item => isKilogramUnit(item.product?.unit?.siglas))
                .reduce((sum, item) => exactAdd(sum, item.quantity || 0), '0'));
        }
        const totalOutput = await Output.sum('total', {where});
        const totalQuantity = await DetailsOutput.sum('quantity', {
            include: [
                {
                    attributes: [],
                    association: 'output',
                    where: whereSum
                },
                {
                    association: 'product', attributes: [], required: true,
                    include: [{
                        association: 'unit', attributes: [], required: true,
                        where: { siglas: { [Op.in]: KILOGRAM_UNITS } },
                    }],
                }
            ]
        });
        outputs.totals = {
            totalOutput,
            totalQuantity,
            total_amount: totalOutput,
            kg_total: totalQuantity,
            total_quantity: totalQuantity,
        }
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
        const requestKey = req.get('Idempotency-Key');
        if (requestKey) {
            const priorPosting = await CjLedger.findOne({ where: { idempotency_key: `OUTPUT-REQUEST-${requestKey}` }, transaction: t });
            if (priorPosting) {
                const priorOutput = await Output.findByPk(priorPosting.source_id, { transaction: t });
                await t.rollback();
                return res.status(200).json({ ok: true, msg: 'La venta ya fue registrada.', id_output: priorOutput?.id, cod: priorOutput?.cod, repeated: true });
            }
        }

        output_data.id_user = req.userAuth.id;

        output_data.type_output = output_data.pay_to_credit
            ? 'CREDITO'
            : 'CONTADO';

        const {
            id_sucursal,
            id_storage,
            number_registry
        } = output_data;
        const integrityLocations = output_details.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal, storageId: id_storage }));
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        const stockValidationErrors = await validateOutgoingDetails({ details: output_details, idSucursal: id_sucursal, idStorage: id_storage, transaction: t });
        if (stockValidationErrors.length) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: stockValidationErrors });
        }

        // GENERAR NUMERO AUTOMATICO SI ES "SIN FICHA"
            if (
            number_registry === 'SIN FICHA' ||
            !number_registry ||
            number_registry === ''
        ) {

            const lastOutput = await Output.findOne({
                where: {
                    number_registry: {
                        [Op.like]: 'SFV-%'
                    }
                },
                order: [['id', 'DESC']],
                transaction: t
            });

            let nextNumber = 1;

            if (
                lastOutput &&
                lastOutput.number_registry
            ) {

                const parts = lastOutput.number_registry.split('-');

                const lastNumber = parseInt(parts[1]) || 0;

                nextNumber = lastNumber + 1;
            }

            output_data.number_registry = get_num_request(
                'SFV-',
                nextNumber,
                5
            );
        }

        /**Crear venta y cod */
        const output = await Output.create(
            output_data,
            { transaction: t }
        );

        const count_outputs = await Output.count({
            where: { id_sucursal },
            transaction: t
        });

        const cod = get_num_request(
            'V',
            count_outputs,
            5
        );

        output.cod = cod;

        await output.save({ transaction: t });

        const id_output = output.id;

        /** Venta por mayor */
        if (
            output_big &&
            output_data.voucher != 'MENOR'
        ) {

            output_big.id_output = id_output;

            await OutputBig.create(
                output_big,
                { transaction: t }
            );
        }

        /*  detalles de la venta */
        let listProductNotStock = [];

        for (const detail of output_details) {

            detail.id_output = id_output;

            const createdDetail = await DetailsOutput.create(
                detail,
                { transaction: t }
            );

            const stock = await Stock.findOne({
                where: {
                    id_product: detail.id_product,
                    id_sucursal,
                    id_storage,
                    status: true
                },
                include: [{
                    association: 'product',
                    required: true,
                    attributes: ['name', 'cod']
                }],
                lock: true,
                transaction: t
            });

            if (!stock) {
                const product = await Product.findByPk(detail.id_product, { attributes: ['cod', 'name'], transaction: t });
                listProductNotStock.push({
                    msg: `${product ? `${product.cod} - ${product.name}` : `Producto ${detail.id_product}`} no tiene un registro activo de stock en la sucursal ${id_sucursal} y almacén ${id_storage}. Asígnele stock antes de registrar la venta.`,
                });
                continue;
            }

            // ERROR STOCK INSUFICIENTE
            const availability = await hasAvailableStock(stock, detail.quantity, t);
            if (!availability.sufficient) {

                listProductNotStock.push({
                    msg: `${stock.product.cod} - ${stock.product.name}: solicita ${detail.quantity}, pero hay ${availability.available_stock} disponibles en Stock.`,
                });
                continue;
            }

            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, direction: 'OUTPUT', transaction: t,
            });
            await valuedKardex.recordMovement({
                sourceType: 'OUTPUT', sourceId: id_output, sourceDetailId: createdDetail.id, effectType: 'ORIGINAL',
                id_product: detail.id_product, id_sucursal, id_storage, id_user: req.userAuth.id,
                direction: 'OUTPUT', quantity: detail.quantity, movementDate: output.date_voucher || new Date(), transaction: t,
            });
        }

        // MENSAJE DE STOCK INSUFICIENTE
        if (listProductNotStock.length > 0) {

            await t.rollback();

            return res.status(422).json({
                ok: false,
                errors: listProductNotStock,
            });
        }

        /* Ingreso si es venta a crédito */
        let description_caja = `POR VENTA #${cod}`;

        if (output_data.pay_to_credit) {

            const monto_restante =
                Number(output_data.total) -
                Number(output_data.on_account);

            const output_credit =
                await AccountsReceivable.create({
                    id_output,
                    id_client: output_data.id_client,
                    description: `POR VENTA #${cod}`,
                    date_credit: new Date(),
                    total: output_data.total,
                    monto_abonado: output_data.on_account,
                    status_account:
                        monto_restante === 0
                            ? 'PAGADO'
                            : 'PENDIENTE',
                    monto_restante,
                    id_sucursal,
                    status: true,
                }, { transaction: t });

            const count_accounts_receivable =
                await AccountsReceivable.count({
                    where: { id_sucursal },
                    transaction: t
                });

            const cod_credit = get_num_request(
                'CC',
                count_accounts_receivable,
                5
            );

            output_credit.cod = cod_credit;

            await output_credit.save({
                transaction: t
            });

            let new_abono;

            if (
                Number(output_data.on_account) > 0
            ) {

                new_abono =
                    await AbonosAccountsReceivable.create({
                        id_account_receivable:
                            output_credit.id,
                        date_abono: new Date(),
                        monto_abono:
                            output_data.on_account,
                        total_abonado:
                            output_data.on_account,
                        restante_credito:
                            Number(output_data.total) -
                            Number(output_data.on_account),
                        id_user: req.userAuth.id,
                        status: true,
                    }, { transaction: t });

                description_caja =
                    `POR ABONO CREDITO #${output_credit.cod} ABONO #${new_abono.id}`;
            }
        }

        const amountReceived = Number(output_data.pay_to_credit ? output_data.on_account : output_data.total) || 0;
        await postOperationalMovement({ branchId: id_sucursal, userId: req.userAuth.id, userRole: req.userAuth.role, cashboxType: output_data.cashbox_type, direction: 'IN', amount: amountReceived,
            paymentType: output_data.type_payment, bankId: output_data.id_bank, description: description_caja,
            sourceType: 'OUTPUT', sourceId: output.id, transaction: t, idempotencyKey: requestKey ? `OUTPUT-REQUEST-${requestKey}` : undefined });
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

        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
        await t.commit();

        return res.status(201).json({
            ok: true,
            msg: 'Venta creada correctamente',
            id_output,
        });

    } catch (error) {

        await t.rollback();

        console.log('ERROR VENTA:', error);

        const status = error.statusCode || error.status || 500;
        return res.status(status).json({
            ok: false,
            ...(error.code ? { code: error.code } : {}),
            errors: [{ msg: status < 500 && error.message
                ? error.message
                : 'No se pudo registrar la venta; la operación fue revertida. Contacte a soporte si vuelve a ocurrir.' }],
            ...(Array.isArray(error.details) ? { details: error.details } : {}),
        });
    }
};

const updateOutput = async (req = request, res = response) => {

    const t = await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });

    try {

        const { id_output } = req.params;

        const {
            output_data,
            output_details,
            output_big
        } = req.body;

        const {
            id_sucursal,
            id_storage,
            registry_number
        } = output_data;

        output_data.id_user = req.userAuth.id;

        output_data.type_output =
            output_data.pay_to_credit
                ? 'CREDITO'
                : 'CONTADO';

        const output_old = await Output.findByPk(
            id_output,
            {
                include:[
                    { association:'detailsOutput' },
                    {
                        association:'accounts_receivable',
                        include:[{
                            association:'abonosAccountsReceivable',
                            required:false,
                            where:{ status:true }
                        }]
                    }
                ],
                transaction:t
            }
        );
        const integrityLocations = [
            ...output_old.detailsOutput.map(({ id_product }) => ({ productId: id_product, sucursalId: output_old.id_sucursal, storageId: output_old.id_storage })),
            ...output_details.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal, storageId: id_storage })),
        ];
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));

        // UPDATE OUTPUT
        await Output.update(
            output_data,
            {
                where:{ id:id_output },
                transaction:t
            }
        );

        // ELIMINAR DETALLES VIEJOS
        await DetailsOutput.destroy({
            where:{
                id:[
                    ...output_old.detailsOutput.map(
                        resp=>resp.id
                    )
                ]
            },
            transaction:t
        });

        // OUTPUT BIG
        await OutputBig.destroy({
            where:{ id_output },
            transaction:t
        });

        if(
            output_big &&
            output_data.voucher!='MENOR'
        ){

            output_big.id_output=id_output;

            await OutputBig.create(
                output_big,
                { transaction:t }
            );
        }

        // DEVOLVER STOCK ANTIGUO
        for(
            const detail_old
            of output_old.detailsOutput
        ){

            const stock =
                await Stock.findOne({

                order:[['id','DESC']],

                where:{
                    id_product:
                        detail_old.id_product,

                    id_sucursal:
                        output_old.id_sucursal,

                    id_storage:
                        output_old.id_storage,

                    status:true
                },

                lock:true,

                transaction:t
            });

            if(stock){

                await applyDerivedStockEffect({
                    productId: detail_old.id_product, sucursalId: output_old.id_sucursal,
                    storageId: output_old.id_storage, quantity: detail_old.quantity, transaction: t,
                });
            }
        }

        const stockValidationErrors = await validateOutgoingDetails({ details: output_details, idSucursal: id_sucursal, idStorage: id_storage, transaction: t });
        if (stockValidationErrors.length) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: stockValidationErrors });
        }

        // NUEVOS DETALLES
        let listProductNotStock=[];

        for(
            const detail
            of output_details
        ){

            const stock =
                await Stock.findOne({

                where:{
                    id_product:
                        detail.id_product,

                    id_sucursal,

                    id_storage,

                    status:true
                },

                include:[{
                    association:'product',
                    required:true,
                    attributes:[
                        'name',
                        'cod'
                    ]
                }],

                lock:true,

                transaction:t
            });

            if(!stock){

                listProductNotStock.push({
                    msg: `El producto ${detail.id_product} no tiene un registro activo de stock en la sucursal ${id_sucursal} y almacén ${id_storage}. La venta no se modificó.`,
                });

                continue;
            }

            const availability = await hasAvailableStock(stock, detail.quantity, t);
            if(!availability.sufficient){

                listProductNotStock.push({
                    msg:
                    `${stock.product.cod} - ${stock.product.name}: solicita ${detail.quantity}, pero hay ${availability.available_stock} disponibles en Stock.`
                });

                continue;
            }

            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, direction: 'OUTPUT', transaction: t,
            });

            detail.id_output =
                id_output;

            await DetailsOutput.create(
                detail,
                { transaction:t }
            );
        }

        if(
            listProductNotStock.length>0
        ){

            await t.rollback();

            return res.status(422).json({

                ok:false,

                errors:
                    listProductNotStock

            });
        }

        // CREDITOS: mantener coherentes la venta, la cuenta por cobrar y su ingreso de caja.
        const oldAccountsReceivable = output_old.accounts_receivable;
        const oldAbonos = oldAccountsReceivable?.abonosAccountsReceivable || [];
        const oldCashDescriptions = [
            `POR VENTA #${output_old.cod}`,
            ...(oldAccountsReceivable?.cod
                ? oldAbonos.map(abono => `POR ABONO CREDITO #${oldAccountsReceivable.cod} ABONO #${abono.id}`)
                : []),
        ];
        const hasMultipleCreditPayments = output_old.type_output === 'CREDITO' && oldAbonos.length > 1;

        if (hasMultipleCreditPayments && Number(output_old.total) !== Number(output_data.total)) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: [{
                msg: 'No se puede cambiar el total: esta venta tiene varios abonos registrados. Anule los abonos o conserve el total actual.',
            }] });
        }
        if (hasMultipleCreditPayments && !output_data.pay_to_credit) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: [{
                msg: 'No se puede convertir esta venta a contado porque tiene varios abonos aplicados a su cuenta por cobrar.',
            }] });
        }

        if (!hasMultipleCreditPayments) {
            const accountsReceivable_old = oldAccountsReceivable
                ? await AccountsReceivable.findByPk(oldAccountsReceivable.id, { transaction: t })
                : null;

            if(accountsReceivable_old){

                await AbonosAccountsReceivable.destroy({

                    where:{
                        id_account_receivable:
                        accountsReceivable_old.id
                    },

                    transaction:t
                });

                await AccountsReceivable.destroy({

                    where:{
                        id:
                        accountsReceivable_old.id
                    },

                    transaction:t
                });
            }

            let description_caja=
                `POR VENTA #${output_old.cod}`;

            let output_credit = null;
            let newAbono = null;

            if(
                output_data.pay_to_credit
            ){

                const monto_restante=
                    Number(output_data.total)-
                    Number(output_data.on_account);

                output_credit=
                    await AccountsReceivable.create({

                    id_output,

                    id_client:
                    output_data.id_client,

                    description:
                    `POR VENTA #${output_old.cod}`,

                    date_credit:
                    new Date(),

                    total:
                    output_data.total,

                    monto_abonado:
                    output_data.on_account,

                    status_account:
                    monto_restante===0
                    ?'PAGADO'
                    :'PENDIENTE',

                    monto_restante,

                    id_sucursal,

                    status:true

                },{ transaction:t });

                const count =
                    await AccountsReceivable.count({

                    where:{ id_sucursal },

                    transaction:t

                });

                output_credit.cod =
                    get_num_request(
                        'CC',
                        count,
                        5
                    );

                await output_credit.save({
                    transaction:t
                });

                if (Number(output_data.on_account) > 0) {
                    newAbono = await AbonosAccountsReceivable.create({
                        id_account_receivable: output_credit.id,
                        date_abono: new Date(),
                        monto_abono: output_data.on_account,
                        total_abonado: output_data.on_account,
                        restante_credito: monto_restante,
                        id_user: req.userAuth.id,
                        status: true,
                        type_payment: output_data.type_payment,
                        account_input: output_data.account_output,
                        id_bank: output_data.id_bank,
                    }, { transaction: t });
                    description_caja = `POR ABONO CREDITO #${output_credit.cod} ABONO #${newAbono.id}`;
                }
            }

            const oldCashDetails = await DetailsCajaSmall.findAll({
                where: { description: { [Op.in]: oldCashDescriptions }, status: true },
                order: [['id', 'ASC']],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            const cashDetailData = {
                date: new Date(),
                type: 'INGRESO',
                type_payment: output_data.type_payment,
                id_bank: output_data.id_bank,
                account_payment: output_data.account_output,
                monto: output_data.pay_to_credit ? output_data.on_account : output_data.total,
                description: description_caja,
                status: true,
            };

            if (oldCashDetails.length) {
                await oldCashDetails[0].update(cashDetailData, { transaction: t });
                if (oldCashDetails.length > 1) {
                    await DetailsCajaSmall.update({ status: false }, {
                        where: { id: { [Op.in]: oldCashDetails.slice(1).map(detail => detail.id) } },
                        transaction: t,
                    });
                }
            } else {
                const caja = await validaOpenCajaSmall(id_sucursal, req.userAuth.id, 'CHICA');
                if (!caja) {
                    const error = new Error('No se puede registrar el cobro: primero debe abrir Caja Chica.');
                    error.statusCode = 422;
                    throw error;
                }
                await DetailsCajaSmall.create({ ...cashDetailData, id_caja_small: caja.id }, { transaction: t });
            }
        }

        await History.create({

            id_user:
                req.userAuth.id,

            description:
                `MODIFICO VENTA CON #${output_old.cod}`,

            type:
                'EDITO VENTA',

            module:
                'OUTPUT',

            action:
                'UPDATE',

            id_sucursal,

            id_reference:
                id_output,

            status:true

        },{ transaction:t });

        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
        await t.commit();

        return res.status(201).json({

            ok:true,

            msg:
            'Venta modificada correctamente',

            id_output

        });

    } catch(error){

        await t.rollback();

        console.log(
            'ERROR UPDATE VENTA:',
            error
        );

        const status = error.statusCode || error.status || 500;
        return res.status(status).json({
            ok: false,
            ...(error.code ? { code: error.code } : {}),
            errors: [{ msg: status < 500 && error.message
                ? error.message
                : 'No se pudo modificar la venta; los cambios fueron revertidos. Contacte a soporte si vuelve a ocurrir.' }],
            ...(Array.isArray(error.details) ? { details: error.details } : {}),
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
        const integrityLocations = output_anular.detailsOutput.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal, storageId: id_storage }));
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        for (const detail of output_anular.detailsOutput) {
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, transaction: t,
            });
            await valuedKardex.reverseOriginal({
                originalSourceType: 'OUTPUT', originalSourceId: output_anular.id, originalSourceDetailId: detail.id,
                sourceType: 'REVERSAL', sourceId: `OUTPUT_CANCELLATION:${output_anular.id}`, sourceDetailId: detail.id,
                effectType: 'REVERSE_OUTPUT', id_user: req.userAuth.id, movementDate: new Date(),
                id_product: detail.id_product, id_sucursal, id_storage, transaction: t,
            });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
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
    getOutputFindOne,
    newOutput,
    updateOutput,
    anularOutput
}

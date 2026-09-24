const { response, request } = require('express');
const { Input, sequelize, History ,Stock,DetailsInput,AccountsPayable,AbonosAccountsPayable, Sequelize,Product,} = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { fileMoveAndRemoveOld } = require('../helpers/file-upload');
const path = require('path');
const fs = require('fs');
const { hasAvailableStock } = require('../services/stock-availability.service');
const purchaseAudit = require('../services/purchase-audit.service');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const { applyDerivedStockEffect } = require('../services/inventory-posting.service');
const { getStockKardexIntegrity, verifyLocationsIntegrityPreserved } = require('../services/stock-kardex-integrity.service');

const { resolveAuthorizer } = require('../services/purchase-authorization.service');
const { classifyInitialPricing } = require('../services/purchase-pricing-authorization-policy.service');

const valuedKardex = new ValuedKardexService();
const parseIds = (value) => String(value || '').split(',').map(Number).filter(Number.isFinite);
const OPERATIONAL_INPUT_SORT_FIELDS = new Set(['id', 'cod', 'date_voucher', 'type_registry', 'registry_number', 'total', 'type', 'status']);

const getOperationalOrder = ({ field_sort, order, orderNew }) => {
    const legacyField = Array.isArray(orderNew) ? orderNew[0] : undefined;
    const field = OPERATIONAL_INPUT_SORT_FIELDS.has(field_sort) ? field_sort
        : OPERATIONAL_INPUT_SORT_FIELDS.has(legacyField) ? legacyField : 'date_voucher';
    const direction = String(order || (Array.isArray(orderNew) ? orderNew[1] : '')).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return [field, direction];
};

const auditRequestKey = (req, suffix) => {
    const supplied = req.get('Idempotency-Key');
    return supplied ? `purchase:${supplied}:${suffix}` : null;
};

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
                { association: 'detailsInput', where: { status: 'ACTIVE' }, required: false, attributes: {exclude: ['id_input','createdAt','updatedAt']}, 
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
                old_customer, with_pickup, field_sort, order
            } = req.query;
        const sucursalIds = parseIds(id_sucursal);
        const storageIds = parseIds(id_storage);
        const whereDate = whereDateForType(filterBy,date1, date2, '"Input"."date_voucher"');
        const whereDateSum = whereDateForType(filterBy,date1, date2, '"input"."date_voucher"');
        const where = {
            [Op.and]: [
                sucursalIds.length ? { id_sucursal: { [Op.in]: sucursalIds } } : {},
                storageIds.length ? { id_storage: { [Op.in]: storageIds } } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                { status: status || 'ACTIVE' },
                { date_voucher: whereDate },
                referral_sources ? { referral_sources } : {},
                old_customer ? { old_customer: old_customer == 'SI' } : {},
                with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
            ]
        };
        const whereSum = {
            [Op.and]: [
                sucursalIds.length ? { id_sucursal: { [Op.in]: sucursalIds } } : {},
                storageIds.length ? { id_storage: { [Op.in]: storageIds } } : {},
                type_pay      ? { type:type_pay } : {},
                type_registry ? { type_registry } : {},
                id_provider   ? { id_provider   } : {},
                { status: status || 'ACTIVE' },
                { date_voucher: whereDateSum },
                referral_sources ? { referral_sources } : {},
                old_customer ? { old_customer: old_customer == 'SI' } : {},
                with_pickup   ? { with_pickup: with_pickup == 'SI'} : {},
            ]
        };
        const optionsDb = {
            order: [getOperationalOrder({ field_sort, order, orderNew })],
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
                { association: 'detailsInput', where: { status: 'ACTIVE' }, required: false, attributes: {exclude: ['id_input','createdAt','updatedAt']}, 
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
        const createIdempotencyKey = auditRequestKey(req, 'create');
        const repeatedCreate = await purchaseAudit.findEventByIdempotencyKey(createIdempotencyKey, t);
        if (repeatedCreate) {
            await t.rollback();
            return res.status(200).json({ ok: true, msg: 'La compra ya fue registrada.', id_input: repeatedCreate.id_input, repeated: true });
        }
        const correlationId = purchaseAudit.createCorrelationId();
        const { id_sucursal, id_provider, id_storage,registry_number, type_registry } = input_data; //,registry_number(validar_ num boleta)
        const integrityLocations = input_details.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal, storageId: id_storage }));
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        //number default, not ficha
        if(type_registry === 'SIN FICHA') {
            const lastInput = await Input.findOne({
                where: { 
                    type_registry: 'SIN FICHA',
                    registry_number: { [Op.or]: [
                        { [Op.like]: 'SF-%' },
                        { [Op.like]: 'SFC-%' }
                    ]}
                },
                order: [
                    [
                        Sequelize.cast(
                            Sequelize.fn('split_part', Sequelize.col('registry_number'), '-', 2),
                            'INTEGER'
                        ),
                        'DESC'
                    ]
                ],
                transaction: t
            });
            let nextNumber = 1;
            if (lastInput && lastInput.registry_number) {
                const lastNumber = parseInt(lastInput.registry_number.split('-')[1]);
                nextNumber = lastNumber + 1;
            }
            input_data.registry_number = get_num_request('SFC-',nextNumber,5);
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
        const createdDetails = [];
        for (const detail of input_details) {
            detail.id_input = id_input;
            detail.created_by = req.userAuth.id;
            const createdDetail = await DetailsInput.create(detail,{ transaction: t });
            createdDetails.push(createdDetail);
            //**ACTUALIZAR COSTO PRODUCTO */
            //await Product.update({costo: detail.cost},{where: {id:detail.id_product},transaction: t});
            //**ACTUALIZAR STOCK */
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, transaction: t,
            });
            await valuedKardex.recordMovement({
                sourceType: 'INPUT', sourceId: input.id, sourceDetailId: createdDetail.id, effectType: 'ORIGINAL',
                id_product: detail.id_product, id_sucursal, id_storage, id_user: req.userAuth.id,
                direction: 'INPUT', quantity: detail.quantity, unitCost: detail.cost,
                movementDate: input.date_voucher, transaction: t,
            });
        }
         /* Ingreso si es compra a credito */
        let inputCredit = null;
        let initialPayment = null;
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
            inputCredit = input_credit;
            if(Number(input_data.on_account) > 0){
                initialPayment = await AbonosAccountsPayable.create({
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
        await purchaseAudit.createEvent({
            transaction: t, correlationId, idempotencyKey: createIdempotencyKey, input,
            actorUserId: req.userAuth.id, entityType: purchaseAudit.ENTITY_TYPES.PURCHASE,
            entityId: input.id, eventType: purchaseAudit.EVENT_TYPES.PURCHASE_CREATED,
            afterData: { ...purchaseAudit.pick(input, purchaseAudit.AUDITABLE_INPUT_FIELDS), details: createdDetails.map((item) => purchaseAudit.pick(item, purchaseAudit.AUDITABLE_DETAIL_FIELDS)) },
            changedFields: [{ field: 'status', before: null, after: input.status }],
        });
        for (const detail of createdDetails) {
            await purchaseAudit.createEvent({ transaction: t, correlationId, input, actorUserId: req.userAuth.id,
                entityType: purchaseAudit.ENTITY_TYPES.DETAIL, entityId: detail.id, detailId: detail.id,
                eventType: purchaseAudit.EVENT_TYPES.DETAIL_ADDED,
                afterData: purchaseAudit.pick(detail, purchaseAudit.AUDITABLE_DETAIL_FIELDS) });
        }
        if (inputCredit) {
            await purchaseAudit.createEvent({ transaction: t, correlationId, input, actorUserId: req.userAuth.id,
                entityType: purchaseAudit.ENTITY_TYPES.ACCOUNT, entityId: inputCredit.id, accountId: inputCredit.id,
                eventType: purchaseAudit.EVENT_TYPES.ACCOUNT_CREATED,
                afterData: purchaseAudit.pick(inputCredit, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS) });
        }
        if (initialPayment) {
            await purchaseAudit.createEvent({ transaction: t, correlationId, input, actorUserId: req.userAuth.id,
                entityType: purchaseAudit.ENTITY_TYPES.PAYMENT, entityId: initialPayment.id, accountId: inputCredit.id, paymentId: initialPayment.id,
                eventType: purchaseAudit.EVENT_TYPES.PAYMENT_CREATED,
                afterData: purchaseAudit.pick(initialPayment, purchaseAudit.AUDITABLE_PAYMENT_FIELDS) });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
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
        const updateIdempotencyKey = auditRequestKey(req, 'update');
        const repeatedUpdate = await purchaseAudit.findEventByIdempotencyKey(updateIdempotencyKey, t);
        if (repeatedUpdate) {
            await t.rollback();
            return res.status(200).json({ ok: true, msg: 'La modificación ya fue registrada.', id_input: repeatedUpdate.id_input, repeated: true });
        }
        const { input_data, input_details } = req.body;
        const { id_sucursal, id_provider, id_storage, registry_number, type_registry } = input_data;
        const reason = String(input_data.audit_reason || req.body.audit_reason || '').trim();
        const requestedAuthorizerId = input_data.id_authorizer_user || req.body.id_authorizer_user;
        delete input_data.id_user;
        delete input_data.audit_reason;
        delete input_data.id_authorizer_user;
        input_data.updated_by = req.userAuth.id;
        input_data.type =  input_data.pay_to_credit ? 'CREDITO' : 'CONTADO';
        const input_old = await Input.findByPk(id_input,{
            include: [ 
                { association: 'provider'},
                { association: 'scale'},
                { association: 'user'},
                { association: 'bank'},
                { association: 'detailsInput', where: { status: 'ACTIVE' }, required: false},
                { association: 'accounts_payable', include:[ {association: 'abonosAccountsPayable', required:false,where: {status:true}}]},
            ],
            lock: { level: t.LOCK.UPDATE, of: Input },
            transaction: t
        });
        if (!input_old) {
            await t.rollback();
            return res.status(404).json({ ok: false, errors: [{ msg: 'La compra no existe.' }] });
        }
        const integrityLocations = [
            ...input_old.detailsInput.map(({ id_product }) => ({ productId: id_product, sucursalId: input_old.id_sucursal, storageId: input_old.id_storage })),
            ...input_details.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal, storageId: id_storage })),
        ];
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        const correlationId = purchaseAudit.createCorrelationId();
        const beforeInput = purchaseAudit.pick(input_old, purchaseAudit.AUDITABLE_INPUT_FIELDS);
        const beforeDetails = input_old.detailsInput.map((item) => purchaseAudit.pick(item, purchaseAudit.AUDITABLE_DETAIL_FIELDS));
        const requestedDetailsForDiff = input_details.map((item) => purchaseAudit.pick(item, purchaseAudit.AUDITABLE_DETAIL_FIELDS));
        const detailChanges = purchaseAudit.diffDetails(beforeDetails, requestedDetailsForDiff);
        const pricingDecision = classifyInitialPricing({
            originalInput: input_old,
            originalDetails: input_old.detailsInput,
            requestedInput: input_data,
            requestedDetails: input_details,
        });
        let authorizer = null;
        if (pricingDecision.requiresAuthorization) {
            if (reason.length < 5) {
                await t.rollback();
                const authorizationMessage = pricingDecision.reason === 'pricing-window-expired'
                    ? 'La ventana de regularización de 24 horas venció. Indique un motivo y un responsable de autorización.'
                    : 'Esta edición requiere un motivo de al menos 5 caracteres y un responsable de autorización.';
                return res.status(422).json({
                    ok: false,
                    code: 'PURCHASE_EDIT_AUTHORIZATION_REQUIRED',
                    errors: [{ msg: authorizationMessage }],
                });
            }
            authorizer = await resolveAuthorizer(requestedAuthorizerId, t);
        }
        if (type_registry === 'SIN FICHA') {
            if (!input_old.registry_number || input_old.type_registry != 'SIN FICHA') {
                const lastInput = await Input.findOne({
                    where: { 
                        type_registry: 'SIN FICHA',
                        registry_number: { [Op.or]: [
                            { [Op.like]: 'SF-%' },
                            { [Op.like]: 'SFC-%' }
                        ]}
                    },
                    order: [
                        [
                            Sequelize.cast(
                                Sequelize.fn('split_part', Sequelize.col('registry_number'), '-', 2),
                                'INTEGER'
                            ),
                            'DESC'
                        ]
                    ],
                    transaction: t
                });
                
                let nextNumber = 1;
                if (lastInput && lastInput.registry_number) {
                    const lastNumber = parseInt(lastInput.registry_number.split('-')[1]);
                    nextNumber = lastNumber + 1;
                }
                
                input_data.registry_number = get_num_request('SFC-',nextNumber,5);
            } else {
                input_data.registry_number = input_old.registry_number;
            }
        }
        //** Reset details and stock and update input */
        await Input.update(input_data,{where:{id: id_input}, transaction: t});
        //*Descuento stock*/
        for (const detail_old of input_old.detailsInput){
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail_old.id_product, id_sucursal:input_old.id_sucursal, id_storage:input_old.id_storage, status: true },
                lock: true,
                transaction: t
            });
            if(stock) {
                const availability = await hasAvailableStock(stock, detail_old.quantity, t);
                if (!availability.sufficient) {
                    await t.rollback();
                    return res.status(422).json({
                        ok: false,
                        errors: [{ msg: `No se puede modificar la compra: el producto ${detail_old.id_product} tiene sólo ${availability.available_stock} de stock disponible.` }],
                    });
                }
                await applyDerivedStockEffect({
                    productId: detail_old.id_product, sucursalId: input_old.id_sucursal,
                    storageId: input_old.id_storage, quantity: detail_old.quantity,
                    direction: 'OUTPUT', transaction: t,
                });
            }
        }
        //*** Actualizar detalles conservando su identidad y reponer stock */
        const remainingOldDetails = new Map(input_old.detailsInput.map((item) => [Number(item.id), item]));
        const oldByProduct = new Map(input_old.detailsInput.map((item) => [Number(item.id_product), item]));
        const persistedDetails = [];
        for (const detail of input_details) {
            detail.id_input = id_input;
            const existing = detail.id ? remainingOldDetails.get(Number(detail.id)) : oldByProduct.get(Number(detail.id_product));
            let persistedDetail;
            if (existing && remainingOldDetails.has(Number(existing.id))) {
                remainingOldDetails.delete(Number(existing.id));
                persistedDetail = await existing.update({ ...detail, status: detail.status || 'ACTIVE', updated_by: req.userAuth.id, removed_by: null, removed_at: null, removal_reason: null }, { transaction: t });
            } else {
                persistedDetail = await DetailsInput.create({ ...detail, status: detail.status || 'ACTIVE', created_by: req.userAuth.id }, { transaction: t });
            }
            persistedDetails.push(persistedDetail);
             //**ACTUALIZAR COSTO PRODUCTO */
            // await Product.update({costo: detail.cost},{where: {id:detail.id_product},transaction: t});     
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, transaction: t,
            });
        }
        for (const removedDetail of remainingOldDetails.values()) {
            await removedDetail.update({ status: 'INACTIVE', removed_by: req.userAuth.id, removed_at: new Date(), removal_reason: reason || 'RETIRADO DURANTE LA EDICIÓN DE LA COMPRA' }, { transaction: t });
        }
        //**Update abono input credit */
        /** si la compra era a crédito
         * Por ende validamos que no se tengan varios abonos. si son varios. no podemos editar o anular abonos.
         */
        let auditedAccount = input_old.accounts_payable || null;
        let accountBefore = auditedAccount ? purchaseAudit.pick(auditedAccount, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS) : null;
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
            const accountsPayableOld = input_old?.accounts_payable?.id
                ? await AccountsPayable.findByPk(input_old.accounts_payable.id, { lock: t.LOCK.UPDATE, transaction: t })
                : null;
            if(input_data.pay_to_credit){
                const monto_restante = Number(input_data.total) - Number(input_data.on_account);
                let inputCredit = accountsPayableOld;
                const accountPayload = {
                    id_input, id_provider: input_data.id_provider,
                    description: `POR COMPRA #${input_old.cod}`,
                    date_credit: inputCredit?.date_credit || new Date(),
                    total: input_data.total,
                    monto_abonado: input_data.on_account,
                    status_account: monto_restante === 0 ? 'PAGADO' : 'PENDIENTE',
                    monto_restante,
                    id_sucursal,
                    status: true,
                    updated_by: req.userAuth.id, voided_by: null, voided_at: null, void_reason: null,
                };
                if (inputCredit) await inputCredit.update(accountPayload, { transaction: t });
                else {
                    inputCredit = await AccountsPayable.create(accountPayload, { transaction: t });
                    const countAccountsPayable = await AccountsPayable.count({ where: {id_sucursal}, transaction: t });
                    inputCredit.cod = get_num_request('CP', countAccountsPayable, 5);
                    await inputCredit.save({ transaction: t });
                }
                auditedAccount = inputCredit;
                const oldInitialPayment = input_old?.accounts_payable?.abonosAccountsPayable?.[0] || null;
                if(Number(input_data.on_account) > 0){
                    const paymentPayload = {
                        id_account_payable :inputCredit.id,
                        date_abono :new Date(),
                        monto_abono :input_data.on_account,
                        total_abonado :input_data.on_account,
                        restante_credito :Number(input_data.total) - Number(input_data.on_account),
                        id_user :req.userAuth.id,
                        status : true,
                        voided_by: null, voided_at: null, void_reason: null,
                    };
                    if (oldInitialPayment) await oldInitialPayment.update(paymentPayload, { transaction: t });
                    else await AbonosAccountsPayable.create(paymentPayload, { transaction: t });
                } else if (oldInitialPayment) {
                    await oldInitialPayment.update({ status: false, voided_by: req.userAuth.id, voided_at: new Date(), void_reason: reason || 'CUOTA INICIAL RETIRADA DURANTE EDICIÓN' }, { transaction: t });
                }
            } else if (accountsPayableOld) {
                await accountsPayableOld.update({ status: false, status_account: 'ANULADO', updated_by: req.userAuth.id, voided_by: req.userAuth.id, voided_at: new Date(), void_reason: reason || 'COMPRA CAMBIADA A CONTADO' }, { transaction: t });
                await AbonosAccountsPayable.update({ status: false, voided_by: req.userAuth.id, voided_at: new Date(), void_reason: reason || 'COMPRA CAMBIADA A CONTADO' }, { where: { id_account_payable: accountsPayableOld.id, status: true }, transaction: t });
                auditedAccount = accountsPayableOld;
            }
        }
        const updatedInput = await Input.findByPk(id_input, { transaction: t });
        const afterInput = purchaseAudit.pick(updatedInput, purchaseAudit.AUDITABLE_INPUT_FIELDS);
        const inputChanges = purchaseAudit.diff(beforeInput, afterInput);
        if (inputChanges.length || detailChanges.length) {
            await purchaseAudit.createEvent({ transaction: t, correlationId, idempotencyKey: updateIdempotencyKey, input: updatedInput,
                actorUserId: req.userAuth.id, authorizerUserId: authorizer?.id,
                entityType: purchaseAudit.ENTITY_TYPES.PURCHASE, entityId: updatedInput.id,
                eventType: purchaseAudit.EVENT_TYPES.PURCHASE_UPDATED, reason,
                beforeData: beforeInput, afterData: afterInput, changedFields: inputChanges });
        }
        const actualDetailChanges = purchaseAudit.diffDetails(beforeDetails, persistedDetails.map((item) => purchaseAudit.pick(item, purchaseAudit.AUDITABLE_DETAIL_FIELDS)));
        for (const change of actualDetailChanges) {
            const detailId = change.after?.id || change.before?.id;
            const eventType = change.kind === 'ADDED' ? purchaseAudit.EVENT_TYPES.DETAIL_ADDED
                : change.kind === 'REMOVED' ? purchaseAudit.EVENT_TYPES.DETAIL_REMOVED
                : change.kind === 'PRICE_CHANGED' ? purchaseAudit.EVENT_TYPES.PRICE_CHANGED : purchaseAudit.EVENT_TYPES.DETAIL_UPDATED;
            await purchaseAudit.createEvent({ transaction: t, correlationId, input: updatedInput,
                actorUserId: req.userAuth.id, authorizerUserId: authorizer?.id,
                entityType: purchaseAudit.ENTITY_TYPES.DETAIL, entityId: detailId, detailId,
                eventType, reason, beforeData: change.before, afterData: change.after, changedFields: change.changes });
        }
        if (auditedAccount) {
            const accountAfter = purchaseAudit.pick(auditedAccount, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS);
            const accountChanges = purchaseAudit.diff(accountBefore || {}, accountAfter);
            if (accountChanges.length) await purchaseAudit.createEvent({ transaction: t, correlationId, input: updatedInput,
                actorUserId: req.userAuth.id, authorizerUserId: authorizer?.id, entityType: purchaseAudit.ENTITY_TYPES.ACCOUNT,
                entityId: auditedAccount.id, accountId: auditedAccount.id,
                eventType: !accountBefore ? purchaseAudit.EVENT_TYPES.ACCOUNT_CREATED : auditedAccount.status === false ? purchaseAudit.EVENT_TYPES.ACCOUNT_VOIDED : purchaseAudit.EVENT_TYPES.ACCOUNT_UPDATED,
                reason, beforeData: accountBefore, afterData: accountAfter, changedFields: accountChanges });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Compra modificada correctamente',
            id_input
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR UPDATE COMPRA: ' + error);
        return res.status(error.status || 500).json({
          ok: false,
          ...(error.code ? { code: error.code } : {}),
          errors: [{ msg: error.status ? error.message : `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getOperationalDate = (req = request, res = response) =>
    res.status(200).json({ ok: true, date: new Date().toISOString() });

const previewAnularInput = async (req = request, res = response) => {
    try {
        const input = await Input.findOne({
            where: { id: req.params.id_input, status: 'ACTIVE' },
            include: [
                { association: 'provider', attributes: ['id', 'full_names'] },
                { association: 'detailsInput', where: { status: 'ACTIVE' }, required: false, include: [{ association: 'product', attributes: ['id', 'cod', 'name'] }] },
                { association: 'accounts_payable', required: false, include: [{ association: 'abonosAccountsPayable', required: false }] },
            ],
        });
        if (!input) return res.status(404).json({ ok: false, errors: [{ msg: 'La compra activa no existe.' }] });
        const account = input.accounts_payable;
        return res.json({ ok: true, preview: {
            purchase: { id: input.id, cod: input.cod, registry_number: input.registry_number, total: input.total, provider: input.provider },
            materials: input.detailsInput.map((detail) => ({ id: detail.id, product: detail.product, quantity: detail.quantity, cost: detail.cost, total: detail.total })),
            account_payable: account ? { id: account.id, cod: account.cod, total: account.total, paid: account.monto_abonado, pending: account.monto_restante, status: account.status_account, payments: account.abonosAccountsPayable } : null,
            effects: ['La compra quedará anulada', 'El stock de los materiales será descontado', ...(account ? ['La cuenta por pagar quedará anulada; los pagos permanecerán en la trazabilidad'] : [])],
        } });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ ok: false, errors: [{ msg: 'No se pudo previsualizar la anulación.' }] });
    }
};

const anularInput = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const {id_input} = req.params;
        const voidIdempotencyKey = auditRequestKey(req, 'void');
        const repeatedVoid = await purchaseAudit.findEventByIdempotencyKey(voidIdempotencyKey, t);
        if (repeatedVoid) {
            await t.rollback();
            return res.status(200).json({ ok: true, msg: 'La compra ya fue anulada.', repeated: true });
        }
        const reason = String(req.body?.reason || req.query?.reason || '').trim();
        if (reason.length < 5) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: [{ msg: 'Indique un motivo de al menos 5 caracteres para anular la compra.' }] });
        }
        const input_anular = await Input.findOne({
            where: { id:id_input, status:'ACTIVE' },
            include: [{association: 'detailsInput', where: { status: 'ACTIVE' }, required: false}, { association: 'accounts_payable', required: false, include: [{ association: 'abonosAccountsPayable', required: false }] }],
            lock: t.LOCK.UPDATE, transaction: t
        });
        if (!input_anular) {
            await t.rollback();
            return res.status(404).json({ ok: false, errors: [{ msg: 'La compra activa no existe.' }] });
        }
        const integrityLocations = input_anular.detailsInput.map(({ id_product }) => ({ productId: id_product, sucursalId: input_anular.id_sucursal, storageId: input_anular.id_storage }));
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        const correlationId = purchaseAudit.createCorrelationId();
        const beforeInput = purchaseAudit.pick(input_anular, purchaseAudit.AUDITABLE_INPUT_FIELDS);
        input_anular.status = 'INACTIVE';
        input_anular.voided_by = req.userAuth.id;
        input_anular.voided_at = new Date();
        input_anular.void_reason = reason;
        await input_anular.save({transaction: t});
        const { id_sucursal, id_storage, } = input_anular;
        for (const detail of input_anular.detailsInput) {
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const availability = await hasAvailableStock(stock, detail.quantity, t);
            if (!availability.sufficient) {
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [{ msg: `No se puede anular la compra: el producto ${detail.id_product} tiene sólo ${availability.available_stock} de stock disponible.` }],
                });
            }
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, direction: 'OUTPUT', transaction: t,
            });
            await valuedKardex.reverseOriginal({
                originalSourceType: 'INPUT', originalSourceId: input_anular.id, originalSourceDetailId: detail.id,
                sourceType: 'REVERSAL', sourceId: `INPUT_CANCELLATION:${input_anular.id}`, sourceDetailId: detail.id,
                effectType: 'REVERSE_INPUT', id_user: req.userAuth.id, movementDate: new Date(),
                id_product: detail.id_product, id_sucursal, id_storage, transaction: t,
            });
        }
        const account = input_anular.accounts_payable;
        if (account?.status) {
            const accountBefore = purchaseAudit.pick(account, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS);
            await account.update({ status:false, status_account: 'ANULADO', voided_by: req.userAuth.id, voided_at: new Date(), void_reason: reason }, { transaction: t });
            await purchaseAudit.createEvent({ transaction: t, correlationId, input: input_anular, actorUserId: req.userAuth.id,
                entityType: purchaseAudit.ENTITY_TYPES.ACCOUNT, entityId: account.id, accountId: account.id,
                eventType: purchaseAudit.EVENT_TYPES.ACCOUNT_VOIDED, reason,
                beforeData: accountBefore, afterData: purchaseAudit.pick(account, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS),
                changedFields: purchaseAudit.diff(accountBefore, purchaseAudit.pick(account, purchaseAudit.AUDITABLE_ACCOUNT_FIELDS)) });
        }
        const afterInput = purchaseAudit.pick(input_anular, purchaseAudit.AUDITABLE_INPUT_FIELDS);
        await purchaseAudit.createEvent({ transaction: t, correlationId, idempotencyKey: voidIdempotencyKey, input: input_anular,
            actorUserId: req.userAuth.id, entityType: purchaseAudit.ENTITY_TYPES.PURCHASE,
            entityId: input_anular.id, eventType: purchaseAudit.EVENT_TYPES.PURCHASE_VOIDED,
            reason, beforeData: beforeInput, afterData: afterInput, changedFields: purchaseAudit.diff(beforeInput, afterInput) });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
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
    getOperationalDate,
    newInput,
    updateInput,
    anularInput,
    previewAnularInput,
    uploadFileVoucher
};

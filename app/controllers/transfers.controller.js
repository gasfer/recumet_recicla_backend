const { response, request } = require('express');
const { randomUUID } = require('crypto');
const { Transfers, sequelize , DetailsTransfers, Stock, History, Product, Category, kardexMovements } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const get_num_request = require('../helpers/generate-cod');
const notificationService = require('../services/notification.service');
const { verifyLocationsIntegrity, getStockKardexIntegrity, verifyLocationsIntegrityPreserved } = require('../services/stock-kardex-integrity.service');
const { buildReceivedDetails } = require('../helpers/transfer-reception');
const {
    applyPhysicallyReceivedReceipt,
    applyBlockedShortageReceipt,
    applyBlockedExcessReceipt,
} = require('../services/transfer-reception-inventory.service');
const { createTransferReviewNote } = require('../services/transfer-review-note.service');
const { evaluateReceiptTolerance, TOLERANCE_DECISIONS } = require('../services/transfer-reception-tolerance.service');
const { ACCOUNTING_STATUSES, isAcceptedToleranceDecision } = require('../constants/transfer-reception-accounting');
const { deriveReceptionStatus } = require('../services/transfer-review-workflow.service');
const { REVIEW_STATUSES } = require('../constants/transfer-review');
const { hasAvailableStock, validateOutgoingDetails } = require('../services/stock-availability.service');
const automatedResolutionService = require('../services/automated-transfer-review-resolution.service');
const transferCancellationService = require('../services/transfer-cancellation.service');
const { getReceptionCancellationAvailability } = require('../services/transfer-cancellation-eligibility.service');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const { applyDerivedStockEffect } = require('../services/inventory-posting.service');
const { recordInventoryRejection } = require('../services/inventory-rejection-audit.service');
const { exactAdd, exactSubtract, exactCompare } = require('../helpers/number-formatter');
const {
    buildOpenReviewWhere,
    isInconclusiveMode,
    mapOpenReviewNote,
    shouldApplyTransferDateFilter,
} = require('../services/open-reception-review-query.service');

const valuedKardex = new ValuedKardexService();

const getTransferFindOne = async (req = request, res = response) => {
    try {
        const { id_transfer } = req.params;
        const optionsDb = {
            include: [
                {association: 'sucursal_send', attributes: ['name']},
                {association: 'sucursal_received', attributes: ['name']},
                {association: 'storage_send', attributes: ['name']},
                {association: 'storage_received', attributes: ['name']},
                {association: 'user_send', attributes: ['full_names']},
                {association: 'user_received', attributes: ['full_names']},
                {association: 'detailsTransfers', include: [
                        { association: 'product',  attributes: [
                                [sequelize.literal(`CONCAT("detailsTransfers->product"."cod",' - ' ,"detailsTransfers->product"."name")`), 'name'],
                                'description',
                                'cod'
                            ],
                        },
                    ]
                },
            ]
        };
        let transfer = await Transfers.findByPk(id_transfer, optionsDb); 
        return res.status(200).json({
            ok: true,
            transfer
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getTransfersPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, status,filterBy, date1, date2, 
                id_sucursal_send, id_storage_send, id_sucursal_received, 
                id_storage_received, id_user_send,id_user_received, reconciliation_status, inconclusive, orderNew} = req.query;

        const applyDateFilter = shouldApplyTransferDateFilter({ inconclusive, filterBy, date1, date2 });
        const whereDate = applyDateFilter
            ? whereDateForType(filterBy,date1, date2, '"Transfers"."date_send"')
            : null;
        const whereDateSum = applyDateFilter
            ? whereDateForType(filterBy,date1, date2, '"transfers"."date_send"')
            : null;
        const baseConditions = [
            id_sucursal_send     ? { id_sucursal_send } : {},
            id_storage_send      ? { id_storage_send  } : {},
            id_sucursal_received ? { id_sucursal_received  } : {},
            id_storage_received  ? { id_storage_received   } : {},
            id_user_send         ? { id_user_send   } : {},
            id_user_received     ? { id_user_received   } : {},
            { status },
        ];
        const isInconclusive = isInconclusiveMode(inconclusive);
        const where = {
            [Op.and]: [...baseConditions, ...(applyDateFilter ? [{ date_send: whereDate }] : [])]
        };

        const whereSum = {
            [Op.and]: [...baseConditions, ...(applyDateFilter ? [{ date_send: whereDateSum }] : [])]
        };
        const reviewNotesInclude = {
            association: 'reviewNotes',
            required: isInconclusive || Boolean(reconciliation_status),
            attributes: ['id', 'registry_number', 'type', 'date', 'id_assigned_user', 'reconciliation_status', 'resolved_at', 'management_status'],
            where: isInconclusive
                ? buildOpenReviewWhere()
                : reconciliation_status
                    ? { reconciliation_status, management_status: { [Op.ne]: 'ELIMINADA' } }
                    : { management_status: { [Op.ne]: 'ELIMINADA' } },
            include: [
                { association: 'assignedUser', attributes: ['id', 'full_names'] },
                { association: 'details', attributes: ['id', 'id_detail_transfer', 'id_product', 'reconciliation_status', 'quantity_difference', 'quantity_resolved'], include: [
                    { association: 'product', attributes: ['id', 'cod', 'name'] },
                    { association: 'transferDetail', attributes: ['id', 'tolerance_decision', 'accounting_status'] },
                    { association: 'inventoryHolds', attributes: ['id', 'disposition'] },
                ] },
                { association: 'resolutionActions', attributes: ['id', 'management_status', 'operation_status'] },
            ],
        };
        const optionsDb = {
            order: [orderNew],
            where,
            distinct: true,
            include: [
                {association: 'sucursal_send', attributes: ['name']},
                {association: 'sucursal_received', attributes: ['name']},
                {association: 'storage_send', attributes: ['name']},
                {association: 'storage_received', attributes: ['name']},
                {association: 'user_send', attributes: ['full_names']},
                {association: 'user_received', attributes: ['full_names']},
                reviewNotesInclude,
                {association: 'detailsTransfers', include: [
                        { association: 'product',  attributes: [
                                [sequelize.literal(`CONCAT("detailsTransfers->product"."cod",' - ' ,"detailsTransfers->product"."name")`), 'name'],
                                'description',
                                'cod'
                            ],
                        },
                    ]
                },
            ]
        };
        let transfers = await paginate(Transfers, page, limit, type, query, optionsDb);
        for (const input of transfers.data) {
            input.dataValues.total_quantity = input.detailsTransfers.reduce((acc, item) => exactAdd(acc, item.quantity || 0), '0.0000');
            input.dataValues.reconciliation_status = deriveReceptionStatus(input.reviewNotes || []);
            input.dataValues.has_reconciliation_history = (input.reviewNotes || []).length > 0;
            input.dataValues.approved_reconciliations = (input.reviewNotes || []).filter(note =>
                note.reconciliation_status === REVIEW_STATUSES.COMPLETED && Boolean(note.resolved_at)
            ).length;
            input.dataValues.reconciliation_history_label = !input.dataValues.has_reconciliation_history
                ? 'Sin conciliaciones' : input.dataValues.approved_reconciliations > 0
                    ? 'Con conciliaciones aprobadas' : 'Con historial de revisión';
            input.dataValues.pending_review_items = (input.reviewNotes || []).reduce((total, note) => (
                total + (note.details || []).filter((detail) =>
                    detail.reconciliation_status !== REVIEW_STATUSES.COMPLETED
                    && !isAcceptedToleranceDecision(detail.transferDetail?.tolerance_decision)
                ).length
            ), 0);
            input.dataValues.review_closure_pending = (input.reviewNotes || []).some((note) => (
                note.reconciliation_status === REVIEW_STATUSES.COMPLETED && !note.resolved_at
            ));
            input.dataValues.open_review_notes = (input.reviewNotes || [])
                .map(mapOpenReviewNote)
                .filter((note) => (note.details || []).length > 0 && (note.pending_items > 0 || !note.resolved_at));
            input.dataValues.reception_cancellation = input.status === 'RECEIVED'
                ? getReceptionCancellationAvailability(input.reviewNotes || [])
                : { enabled: false, reason: 'Sólo una recepción confirmada puede anularse.', blockers: [] };
        }
        const totalTransfer = await Transfers.sum('total', {where});
        const totalQuantity = await DetailsTransfers.sum('quantity', {
            include: [
                {
                    attributes: [],
                    association: 'transfers',
                    where: whereSum
                }
            ]
        }); 
        transfers.totals = {
            totalTransfer,
            totalQuantity
        };
        return res.status(200).json({
            ok: true,
            transfers
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newTransfer = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const { transfer_data, transfer_details } = req.body;
        const { id_sucursal_send, id_storage_send,id_sucursal_received, type_registry } = transfer_data;
        // La fecha debe reflejar el momento real del registro y no una fecha enviada por el cliente.
        transfer_data.date_send = new Date();
        const integrityLocations = transfer_details.map(({ id_product }) => ({ productId: id_product, sucursalId: id_sucursal_send, storageId: id_storage_send }));
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        const stockValidationErrors = await validateOutgoingDetails({ details: transfer_details, idSucursal: id_sucursal_send, idStorage: id_storage_send, transaction: t });
        if (stockValidationErrors.length) {
            await t.rollback();
            return res.status(422).json({ ok: false, errors: stockValidationErrors });
        }
        //number default, not ficha
        if(type_registry === 'SIN FICHA') {
            const count_transfers = await Transfers.count({ where: {type_registry:'SIN FICHA'}, transaction: t });
            transfer_data.registry_number = get_num_request('SF-',count_transfers + 1,5);
        }
        transfer_data.id_user_send = req.userAuth.id;
        transfer_data.status = 'PENDING';
        /**Crear venta y cod */
        const transfer = await Transfers.create(transfer_data, { transaction: t });
        const cod = get_num_request('TRAS',transfer.id,5);
        transfer.cod = cod;
        await transfer.save({transaction: t});
        const id_transfer = transfer.id;
        /*  detalles del traslado */
        let listProductNotStock = [];
        for (const detail of transfer_details) {
            detail.id_transfer = id_transfer;
            const createdDetail = await DetailsTransfers.create(detail,{ transaction: t });
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_send, id_storage:id_storage_send, status: true },
                include: [{association:'product', required:true, attributes: ['name','cod']}],
                lock: true,
                transaction: t
            });
            //??ERROR STOCK INSUFICIENTE
            const availability = await hasAvailableStock(stock, detail.quantity, t);
            if(!availability.sufficient){
                listProductNotStock.push(
                    { msg: `${stock.product.cod} - ${stock.product.name} no tiene suficiente stock disponible. Stock actual: ${availability.physical_stock}, disponible: ${availability.available_stock}.`}
                );
                continue;
            }
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal_send, storageId: id_storage_send,
                quantity: detail.quantity, direction: 'OUTPUT', transaction: t,
            });
            const valuation = await valuedKardex.recordMovement({
                sourceType: 'TRANSFER_SENT', sourceId: transfer.id, sourceDetailId: createdDetail?.id ?? detail.id, effectType: 'ORIGINAL',
                id_product: detail.id_product, id_sucursal: id_sucursal_send, id_storage: id_storage_send,
                id_user: req.userAuth.id, direction: 'OUTPUT', quantity: detail.quantity,
                movementDate: transfer.date_send, transaction: t,
            });
            if (valuation && createdDetail) {
                createdDetail.cost = valuation.applied_unit_cost;
                await createdDetail.save({ transaction: t });
            }
        }
        //??MENSAJE DE STOCK INSUFICIENTE
        if(listProductNotStock.length > 0) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: listProductNotStock,
            });
        } 
         /* Ingreso histórico */
        await History.create({
            id_user: req.userAuth.id,
            description: `NUEVO TRASLADO CON #${cod}`,
            type: 'NUEVO TRASLADO',
            module: 'TRANSFER',
            action: 'CREATE',
            id_sucursal: id_sucursal_send ,
            id_reference: id_transfer,
            status: true
        }, { transaction: t }); 
        /* Notificación a administradores */
        const senderName = req.userAuth ? req.userAuth.full_names : 'Un usuario';
        await notificationService.notifyAdmins({
            title: `Nuevo Traslado Creado #${cod}`,
            message: `El usuario ${senderName} ha registrado el traslado #${cod}.`,
            type: 'TRANSFER_CREATE',
            level: 'INFO',
            id_reference: id_transfer
        }, t, req.userAuth.id);
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Traslado creado correctamente',
            id_transfer,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR TRASLADO: ' + error);
        const status = error.statusCode || error.status || 500;
        if (status < 500) {
            return res.status(status).json({
                ok: false,
                ...(error.code ? { code: error.code } : {}),
                errors: [{ msg: error.message || 'No se pudo registrar el traslado.' }],
            });
        }
        return res.status(status).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const receivedTransfer = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const { id_transfer, id_storage_received, observations_received, date_received, details, id_merma_product } = req.body;
        const transfer_received = await Transfers.findOne({
            where: { id:id_transfer, status:'PENDING' },
            include: [{association: 'detailsTransfers', include: [{ association: 'product', attributes: ['id', 'cod', 'name'] }]}], transaction: t,
            lock: { level: t.LOCK?.UPDATE || true, of: Transfers },
        });
        if (!transfer_received) {
            await t.rollback();
            return res.status(409).json({
                ok: false,
                errors: [{ msg: 'El traslado ya fue recibido, cambió de estado o no existe.' }],
            });
        }
        const receiptDetailsResult = buildReceivedDetails(details, transfer_received.detailsTransfers);
        if (receiptDetailsResult.errors) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: receiptDetailsResult.errors.map((msg) => ({ msg })),
            });
        }
        const evaluatedDetails = receiptDetailsResult.receivedDetails.map((item) => ({
            ...item,
            tolerance: evaluateReceiptTolerance(item.detail.quantity, item.quantityReceived),
        }));
        const shortageDetails = evaluatedDetails
            .filter(({ detail, quantityReceived }) => exactCompare(detail.quantity, quantityReceived) > 0)
            .map(({ detail, quantityReceived }) => ({ detail, quantityReceived }));
        let mermaProduct = null;
        if (shortageDetails.length) {
            if (!Number(id_merma_product)) {
                await t.rollback();
                return res.status(422).json({ ok: false, errors: [{ msg: 'Seleccione un producto activo de la categoría MERMAS para registrar el faltante.' }] });
            }
            mermaProduct = await Product.findOne({
                where: { id: Number(id_merma_product), status: true },
                include: [{ association: 'category', required: true, where: { name: 'MERMAS', type: 'RAW_MATERIAL', status: true } }],
                transaction: t,
                lock: t.LOCK?.UPDATE || true,
            });
            if (!mermaProduct) {
                await t.rollback();
                return res.status(422).json({ ok: false, errors: [{ msg: 'El producto seleccionado no está activo en la categoría MERMAS.' }] });
            }
        }
        transfer_received.status = 'RECEIVED';   
        transfer_received.reception_attempt_key = randomUUID();
        transfer_received.id_user_received = req.userAuth.id;
        if( new Date(transfer_received.date_send)  > new Date(date_received)) {
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [{ msg: `Fecha de recepción no puede ser menor a la fecha de envío.`}],
            });
        }
        transfer_received.id_storage_received = id_storage_received;
        transfer_received.observations_received = observations_received;
        transfer_received.date_received = date_received;
        await transfer_received.save({transaction: t});
        for (const receiptDetail of evaluatedDetails) {
            const { detail, quantityReceived: qtyReceived, observation: obs, tolerance } = receiptDetail;
            detail.quantity_received = qtyReceived;
            detail.observation = obs;
            detail.tolerance_decision = exactCompare(detail.quantity, qtyReceived) === 0
                ? TOLERANCE_DECISIONS.ACCEPTED
                : TOLERANCE_DECISIONS.REQUIRES_REVIEW;
            detail.receipt_difference_percentage = tolerance.differencePercentage;
            detail.accounting_status = ACCOUNTING_STATUSES.ACCOUNTED;
            detail.accounting_applied_at = new Date();
            await detail.save({ transaction: t });
            const sent = exactAdd(detail.quantity, 0);
            const difference = exactCompare(qtyReceived, sent) === 0
                ? '0.0000'
                : exactCompare(qtyReceived, sent) > 0
                    ? exactSubtract(qtyReceived, sent)
                    : exactSubtract(sent, qtyReceived);
            const noteDetail = {
                id_detail_transfer: detail.id,
                id_product: detail.id_product,
                quantity_sent: sent,
                quantity_received: qtyReceived,
                quantity_difference: difference,
            };

            if (exactCompare(qtyReceived, sent) > 0) {
                const { excessMovement, excess } = await applyBlockedExcessReceipt({
                    transfer: transfer_received, detail, quantityReceived: qtyReceived,
                    userId: req.userAuth.id, transaction: t,
                });
                await createTransferReviewNote({
                    type: 'EXCEDENTE_PARA_REVISION', date: transfer_received.date_received,
                    observations: obs, transfer: transfer_received, kardexMovement: excessMovement,
                    productId: detail.id_product, userId: req.userAuth.id, storageId: id_storage_received,
                    details: [{ ...noteDetail, quantity_difference: excess }],
                }, t);
            } else if (exactCompare(qtyReceived, sent) === 0) {
                await applyPhysicallyReceivedReceipt({
                    transfer: transfer_received, detail, quantityReceived: qtyReceived,
                    userId: req.userAuth.id, transaction: t,
                });
            }
        }

        if (shortageDetails.length) {
            const { shortageMovement } = await applyBlockedShortageReceipt({
                transfer: transfer_received, shortageDetails, mermaProduct,
                userId: req.userAuth.id, transaction: t,
            });
            await createTransferReviewNote({
                type: 'FALTANTE_PARA_REVISION', date: transfer_received.date_received,
                observations: observations_received, transfer: transfer_received,
                kardexMovement: shortageMovement, productId: mermaProduct.id,
                userId: req.userAuth.id, storageId: id_storage_received,
                details: shortageDetails.map(({ detail, quantityReceived }) => ({
                    id_detail_transfer: detail.id, id_product: detail.id_product,
                    quantity_sent: exactAdd(detail.quantity, 0), quantity_received: exactAdd(quantityReceived, 0),
                    quantity_difference: exactSubtract(detail.quantity, quantityReceived),
                })),
            }, t);
        }
         /* Ingreso histórico */
        await History.create({
            id_user: req.userAuth.id,
            description: `NUEVA RECEPCIÓN CON #${transfer_received.cod}`,
            type: 'NUEVA RECEPCIÓN',
            module: 'TRANSFER',
            action: 'CREATE',
            id_sucursal: transfer_received.id_sucursal_received,
            id_reference: transfer_received.id,
            status: true
        }, { transaction: t }); 

        await automatedResolutionService.completePendingTransfer({ transferId: transfer_received.id, actorUserId: req.userAuth.id, transaction: t });
        const affectedLocations = evaluatedDetails.map(({ detail }) => ({
            productId: detail.id_product,
            sucursalId: transfer_received.id_sucursal_received,
            storageId: transfer_received.id_storage_received,
        }));
        if (shortageDetails.length) affectedLocations.push({
            productId: mermaProduct.id,
            sucursalId: transfer_received.id_sucursal_received,
            storageId: transfer_received.id_storage_received,
        });
        await verifyLocationsIntegrity({ locations: affectedLocations, transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Traslado recepcionado correctamente',
            id_transfer:transfer_received.id,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR RECEPCIÓN: ' + error);
        try { error = await recordInventoryRejection(error, req.userAuth); }
        catch (_) { error = Object.assign(new Error('No se pudo registrar la auditoría del rechazo. La recepción no se confirmó.'), { statusCode: 503, code: 'INTEGRITY_AUDIT_FAILED' }); }
        return res.status(error.statusCode || 500).json({
          ok: false,
          code: error.code || 'TRANSFER_RECEPTION_FAILED',
          tracking_id: error.correlationId,
          errors: [{
              msg: error.statusCode ? error.message : 'Ocurrió un imprevisto interno | hable con soporte',
              ...(error.details ? { details: error.details } : {}),
          }],
        });
    }
}

const deleteTransfer = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_transfer } = req.params;
        const result = await transferCancellationService.cancelPendingTransfer({ transferId: id_transfer, actorUserId: req.userAuth.id, transaction: t });
        await t.commit();
        if (result.notification) await notificationService.notifyAdmins(result.notification, null, req.userAuth.id);
        return res.status(201).json({
            ok: true,
            msg: "Traslado anulado correctamente", 
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ANULAR TRASLADO: ' + error);
        return res.status(error.statusCode || 500).json({
          ok: false,
          code: error.code || 'TRANSFER_CANCELLATION_FAILED',
          errors: [{ msg: error.statusCode ? error.message : 'Ocurrió un imprevisto interno | hable con soporte'}],
        });  
    }
}

const cancelReception = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_transfer } = req.params;
        const result = await transferCancellationService.cancelReceivedTransfer({
            transferId: id_transfer,
            actorUserId: req.userAuth.id,
            reason: req.body?.reason,
            transaction: t,
        });
        await t.commit();
        if (result.notification) await notificationService.notifyAdmins(result.notification, null, req.userAuth.id);
        return res.status(200).json({
            ok: true,
            msg: 'Recepción anulada correctamente',
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ANULAR RECEPCIÓN: ' + error);
        return res.status(error.statusCode || 500).json({
            ok: false,
            code: error.code || 'RECEPTION_CANCELLATION_FAILED',
            errors: [{
                msg: error.statusCode ? error.message : 'Ocurrió un imprevisto interno | hable con soporte',
                ...(error.details ? { details: error.details } : {}),
            }],
        });
    }
}

module.exports = {
    getTransfersPaginate,
    newTransfer,
    deleteTransfer,
    receivedTransfer,
    getTransferFindOne,
    cancelReception
};

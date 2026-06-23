const { response, request } = require('express');
const { Transfers, sequelize , DetailsTransfers, Stock, History  } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const get_num_request = require('../helpers/generate-cod');

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
                id_storage_received, id_user_send,id_user_received ,orderNew} = req.query;

        const whereDate = whereDateForType(filterBy,date1, date2, '"Transfers"."date_send"');
        const whereDateSum = whereDateForType(filterBy,date1, date2, '"transfers"."date_send"');
        const baseConditions = [
            id_sucursal_send     ? { id_sucursal_send } : {},
            id_storage_send      ? { id_storage_send  } : {},
            id_sucursal_received ? { id_sucursal_received  } : {},
            id_storage_received  ? { id_storage_received   } : {},
            id_user_send         ? { id_user_send   } : {},
            id_user_received     ? { id_user_received   } : {},
            { status },
        ];
        const where = {
            [Op.and]: [...baseConditions, { date_send: whereDate }]
        };

        const whereSum = {
            [Op.and]: [...baseConditions, { date_send: whereDateSum }]
        };
        const optionsDb = {
            order: [orderNew],
            where,
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
        let transfers = await paginate(Transfers, page, limit, type, query, optionsDb);
        for (const input of transfers.data) {
            input.dataValues.total_quantity = input.detailsTransfers.reduce((acc, item) => acc + Number(item.quantity), 0);
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
        }
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
            await DetailsTransfers.create(detail,{ transaction: t });        
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_send, id_storage:id_storage_send, status: true },
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
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Traslado creado correctamente',
            id_transfer,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR TRASLADO: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const receivedTransfer = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const { id_transfer, id_storage_received, observations_received, date_received, details } = req.body;
        const transfer_received = await Transfers.findOne({
            where: { id:id_transfer, status:'PENDING' },
            include: [{association: 'detailsTransfers'}], transaction: t
        });
        transfer_received.status = 'RECEIVED';   
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
        const { id_sucursal_send,id_sucursal_received } = transfer_received;
        /*  detalles del traslado */
        for (const detail of transfer_received.detailsTransfers) {
            let qtyReceived = Number(detail.quantity);
            let obs = null;
            if (details && Array.isArray(details)) {
                const incomingDetail = details.find(d => d.id_detail === detail.id);
                if (incomingDetail && incomingDetail.quantity_received !== undefined && incomingDetail.quantity_received !== null) {
                    qtyReceived = Number(incomingDetail.quantity_received);
                }
                if (incomingDetail && incomingDetail.observation !== undefined) {
                    obs = incomingDetail.observation;
                }
            }
            detail.quantity_received = qtyReceived;
            detail.observation = obs;
            await detail.save({ transaction: t });

            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_received, id_storage:id_storage_received, status: true },
                lock: true,
                transaction: t
            });
            if(!stock) {
                await Stock.create({
                    stock_min: 1, stock: qtyReceived,
                    id_product: detail.id_product, id_sucursal:id_sucursal_received, id_storage:id_storage_received,
                    status: true,
                },{ transaction: t })
            } else {
                stock.stock = Number(stock.stock) + qtyReceived;
                await stock.save({ transaction: t });
            }
        }
         /* Ingreso histórico */
        await History.create({
            id_user: req.userAuth.id,
            description: `NUEVA RECEPCIÓN CON #${transfer_received.cod}`,
            type: 'NUEVA RECEPCIÓN',
            module: 'TRANSFER',
            action: 'CREATE',
            id_sucursal: id_sucursal_received ,
            id_reference: transfer_received.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Traslado recepcionado correctamente',
            id_transfer:transfer_received.id,
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR RECEPCIÓN: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deleteTransfer = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id_transfer } = req.params;
        const transfer_anular = await Transfers.findOne({
            where: { id:id_transfer, status:'PENDING' },
            include: [{association: 'detailsTransfers'}], transaction: t
        });
        transfer_anular.status = 'ANULADO';   
        await transfer_anular.save({transaction: t});
        const { id_sucursal_send, id_storage_send,  id_sucursal_received} = transfer_anular;
        for (const detail of transfer_anular.detailsTransfers) {
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_send, id_storage:id_storage_send, status: true },
                lock: true,
                transaction: t
            });
            stock.stock = Number(stock.stock) + Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        //history
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO EL TRASLADO CON #${transfer_anular.cod}`,
            type: 'ANULO TRASLADO',
            module: 'TRANSFER',
            action: 'DELETE',
            id_sucursal:id_sucursal_send,
            id_reference: transfer_anular.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: "Traslado anulado correctamente", 
        });
    } catch (error) {
        await t.rollback();
        console.log('ERROR ANULAR TRASLADO: ' + error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });  
    }
}

module.exports = {
    getTransfersPaginate,
    newTransfer,
    deleteTransfer,
    receivedTransfer,
    getTransferFindOne
};

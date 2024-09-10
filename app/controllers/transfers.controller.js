const { response, request } = require('express');
const { Transfers, sequelize , DetailsTransfers, Stock, Kardex, History  } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const { whereDateForType } = require('../helpers/where_range');
const get_num_request = require('../helpers/generate-cod');
const { returnDataKardexOutput, returnDataKardexInput } = require('../helpers/kardex');

const getTransfersPaginate = async (req = request, res = response) => {
    try {
        const { query, page, limit, type, status,filterBy, date1, date2, 
                id_sucursal_send, id_storage_send, id_sucursal_received, 
                id_storage_received, id_user_send,id_user_received ,orderNew} = req.query;

        const whereDate = whereDateForType(filterBy,date1, date2, '"Transfers"."date_send"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_sucursal_send     ? { id_sucursal_send } : {},
                    id_storage_send      ? { id_storage_send  } : {},
                    id_sucursal_received ? { id_sucursal_received  } : {},
                    id_storage_received  ? { id_storage_received   } : {},
                    id_user_send         ? { id_user_send   } : {},
                    id_user_received     ? { id_user_received   } : {},
                    { status },
                    { date_send: whereDate }
                ]
            },
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
        const { id_sucursal_send, id_storage_send,id_sucursal_received } = transfer_data;
        transfer_data.id_user_send = req.userAuth.id;
        transfer_data.date_send = new Date();
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
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_send, id_storage:id_storage_send, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexOutput(`TRASLADO #${cod}`,null,null, id_sucursal_received,null,old_kardex,detail,null, id_sucursal_send, id_storage_send );
            await Kardex.create(data_new,{ transaction: t });
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
        const { id_transfer, id_storage_received, observations_received} = req.body;
        const transfer_received = await Transfers.findOne({
            where: { id:id_transfer, status:'PENDING' },
            include: [{association: 'detailsTransfers'}], transaction: t
        });
        transfer_received.status = 'RECEIVED';   
        transfer_received.id_user_received = req.userAuth.id;
        transfer_received.date_received = new Date();
        transfer_received.id_storage_received = id_storage_received;
        transfer_received.observations_received = observations_received;
        await transfer_received.save({transaction: t});
        const { id_sucursal_send,id_sucursal_received } = transfer_received;
        /*  detalles del traslado */
        for (const detail of transfer_received.detailsTransfers) {
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_received, id_storage:id_storage_received, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexInput(`RECEPCIÓN DE TRASLADO #${transfer_received.cod}`,null,id_sucursal_send,null, old_kardex,detail,null, null, id_sucursal_received, id_storage_received);
            await Kardex.create(data_new,{ transaction: t });
            const stock = await Stock.findOne({
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_received, id_storage:id_storage_received, status: true },
                lock: true,
                transaction: t
            });
            if(!stock) {
                await Stock.create({
                    stock_min: 1, stock: detail.quantity,
                    id_product: detail.id_product, id_sucursal:id_sucursal_received, id_storage:id_storage_received,
                    status: true,
                },{ transaction: t })
            } else {
                stock.stock = Number(stock.stock) + Number(detail.quantity);
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
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal:id_sucursal_send, id_storage:id_storage_send, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexInput(`ANULACIÓN TRASLADO #${transfer_anular.cod}`,null,id_sucursal_received,null, old_kardex,detail,null, null, id_sucursal_send, id_storage_send);
            await Kardex.create(data_new,{ transaction: t });
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
    receivedTransfer
};

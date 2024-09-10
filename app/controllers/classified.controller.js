const { response, request } = require('express');
const {  sequelize, Classified, DetailsClassified, Kardex, Stock, History } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { returnDataKardexOutput, returnDataKardexInput } = require('../helpers/kardex');

const getClassifiedsPaginate = async (req = request, res = response) => {
    try {
        const {query, page, limit, type,type_registry,id_product, id_sucursal, id_storage, status, filterBy, date1, date2,orderNew} = req.query;
        const whereDate = whereDateForType(filterBy,date1, date2, '"Classified"."date_classified"');
        const optionsDb = {
            order: [orderNew],
            where: {
                [Op.and]: [
                    id_sucursal    ? { id_sucursal } : {},
                    id_storage     ? { id_storage  } : {},
                    type_registry  ? { type_registry } : {},
                    id_product     ? { id_product   } : {},
                    { status },
                    { date_classified: whereDate }
                ]
            },
            include: [ 
                { association: 'sucursal',attributes: ['name'] },
                { association: 'storage',attributes: ['name'] },
                { association: 'scale', attributes: ['name']},
                { association: 'product',  attributes: [
                    [sequelize.literal(`CONCAT("product"."cod",' - ' ,"product"."name")`), 'name'],
                  ],
                },
                { association: 'user', attributes: ['full_names','number_document']},
                { association: 'detailsClassified', attributes: {exclude: ['id','id_classified','id_product','status','createdAt','updatedAt']}, 
                    include: [{ association: 'product', include: [{association: 'category'},{association: 'unit'}],
                                attributes: {exclude: ['id_category','id_unit','status','createdAt','updatedAt']},}]
                },
            ]
        };
        let classifieds = await paginate(Classified, page, limit, type, query, optionsDb); 
        return res.status(200).json({
            ok: true,
            classifieds
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newClassified = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        const { classified_data, classified_details } = req.body;
        const { id_sucursal, id_storage, number_registry, id_product, cost_product,quantity_product } = classified_data;
        classified_data.id_user = req.userAuth.id;
        /*Creación de clasificación*/
        const classified = await Classified.create(classified_data, { transaction: t });
        const count_classifieds = await Classified.count({ where: {id_sucursal}, transaction: t });
        const cod = get_num_request('CL',count_classifieds,5);
        classified.cod = cod;
        classified.date_classified = new Date();
        await classified.save({transaction: t});
        const id_classified = classified.id;
        /*Salida y Kardex y stock del producto a clasificar*/
        const old_kardex = await Kardex.findOne({ 
            order: [['id', 'DESC']],
            where: { id_product, id_sucursal, id_storage, status: true },
            lock: true,
            transaction: t
        });
        const detail = {
            cost: cost_product,
            quantity: quantity_product,
            id_product,
        }
        const data_new = returnDataKardexOutput(`CLASIFICACIÓN #${cod}`,null,null,null,number_registry,old_kardex,detail,null, id_sucursal, id_storage );
        await Kardex.create(data_new,{ transaction: t });
        const stock = await Stock.findOne({
            where: { id_product, id_sucursal, id_storage, status: true },
            include: [{association:'product', required:true, attributes: ['name','cod']}],
            lock: true,
            transaction: t
        });
        //??ERROR STOCK INSUFICIENTE
        if(stock.stock < quantity_product){
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [
                    { msg: `${stock.product.cod} - ${stock.product.name} no tiene suficiente stock.`}
                ],
            });
        }
        stock.stock = Number(stock.stock) - Number(quantity_product);
        await stock.save({ transaction: t });
        /* Ingreso de detalles de la clasificación */
        for (const detail of classified_details) {
            detail.id_classified = id_classified;
            await DetailsClassified.create(detail,{ transaction: t });        
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexInput(`CLASIFICACIÓN #${cod}`,id_product,null,number_registry, old_kardex,detail,null, null, id_sucursal, id_storage)
            await Kardex.create(data_new,{ transaction: t });
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
        /* Ingreso historico */
        await History.create({
            id_user: req.userAuth.id,
            description: `CREO LA CLASIFICACIÓN CON #${cod}`,
            type: 'NUEVA CLASIFICACIÓN',
            module: 'CLASSIFIED',
            action: 'CREATE',
            id_sucursal,
            id_reference: classified.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Clasificación creada correctamente',
            id_classified,
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

const destroyClassified = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const {id_classified} = req.params;
        const classified_anular = await Classified.findOne({
            where: { id:id_classified, status:'ACTIVE' },
            include: [{association: 'detailsClassified'}], transaction: t
        });
        classified_anular.status = 'INACTIVE';
        await classified_anular.save({transaction: t});
        const { id_sucursal, id_storage, id_product, cost_product, quantity_product} = classified_anular;
        /*ANULAR PRODUCTO CLASIFICADO*/
        const old_kardex = await Kardex.findOne({ 
            order: [['id', 'DESC']],
            where: { id_product, id_sucursal, id_storage, status: true },
            lock: true,
            transaction: t
        });
        const detail = {
            cost: cost_product,
            quantity: quantity_product,
            id_product,
        }
        const data_new = returnDataKardexInput(`ANULACIÓN CLASIFICADO #${classified_anular.cod}`, null,null ,null, old_kardex,detail,null, null, id_sucursal, id_storage)
        await Kardex.create(data_new,{ transaction: t });
        const stock = await Stock.findOne({
            where: { id_product, id_sucursal, id_storage, status: true },
            lock: true,
            transaction: t
        });
        stock.stock = Number(stock.stock) + Number(quantity_product);
        await stock.save({ transaction: t });
        /*ANULAR DETALLE CLASIFICADO*/
        for (const detail of classified_anular.detailsClassified) {
            const old_kardex = await Kardex.findOne({ 
                order: [['id', 'DESC']],
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const data_new = returnDataKardexOutput(`ANULACIÓN CLASIFICADO #${classified_anular.cod}`,null,null,null,null,old_kardex,detail,null, id_sucursal, id_storage );
            await Kardex.create(data_new,{ transaction: t });
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            stock.stock = Number(stock.stock) - Number(detail.quantity);
            await stock.save({ transaction: t });
        }
        await History.create({
            id_user: req.userAuth.id,
            description: `ANULO CLASIFICADO CON #${classified_anular.cod}`,
            type: 'ANULO CLASIFICADO',
            module: 'CLASSIFIED',
            action: 'DELETE',
            id_sucursal,
            id_reference: classified_anular.id,
            status: true
        }, { transaction: t }); 
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: "Clasificación anulada correctamente", 
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

module.exports = {
    getClassifiedsPaginate,
    newClassified,
    destroyClassified
};

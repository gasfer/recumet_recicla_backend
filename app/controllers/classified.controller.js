const { response, request } = require('express');
const {  sequelize, Classified, DetailsClassified, Stock, History } = require('../database/config');
const paginate = require('../helpers/paginate');
const { Op } = require('sequelize');
const get_num_request = require('../helpers/generate-cod');
const { whereDateForType } = require('../helpers/where_range');
const { hasAvailableStock } = require('../services/stock-availability.service');
const { ValuedKardexService } = require('../services/valued-kardex.service');
const { allocateByQuantity } = require('../services/weighted-average.service');
const { applyDerivedStockEffect } = require('../services/inventory-posting.service');
const { getStockKardexIntegrity, verifyLocationsIntegrityPreserved } = require('../services/stock-kardex-integrity.service');

const valuedKardex = new ValuedKardexService();

const recordClassificationValuation = async ({ classified, details, transaction }) => {
    const output = await valuedKardex.recordMovement({
        sourceType: 'CLASSIFICATION_OUTPUT', sourceId: classified.id, effectType: 'ORIGINAL',
        id_product: classified.id_product, id_sucursal: classified.id_sucursal, id_storage: classified.id_storage,
        id_user: classified.id_user, direction: 'OUTPUT', quantity: classified.quantity_product,
        movementDate: classified.date_classified, transaction,
    });
    if (!output) return;
    const allocations = allocateByQuantity(output.output_value, details);
    for (const item of allocations) {
        await valuedKardex.recordMovement({
            sourceType: 'CLASSIFICATION_INPUT', sourceId: classified.id, sourceDetailId: item.id,
            effectType: 'ORIGINAL', id_product: item.id_product, id_sucursal: classified.id_sucursal,
            id_storage: classified.id_storage, id_user: classified.id_user, direction: 'INPUT',
            quantity: item.quantity, unitCost: item.unitCost, movementDate: classified.date_classified,
            transaction,
        });
    }
};

const getClassifiedFindOne= async (req = request, res = response) => {
    try {
        const { id_classified } = req.params;
        const optionsDb = {
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
        let classified = await Classified.findByPk(id_classified, optionsDb); 
        return res.status(200).json({
            ok: true,
            classified
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

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
        const { id_sucursal, id_storage, number_registry, id_product, cost_product,quantity_product, type_registry } = classified_data;
        const integrityLocations = [
            { productId: id_product, sucursalId: id_sucursal, storageId: id_storage },
            ...classified_details.map(({ id_product: detailProductId }) => ({ productId: detailProductId, sucursalId: id_sucursal, storageId: id_storage })),
        ];
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        classified_data.id_user = req.userAuth.id;

       if (type_registry === 'SIN FICHA') {
    // ✅ Buscar el último número generado, no contar
    const lastClassified = await Classified.findOne({
        where: {
            number_registry: {
                [Op.like]: 'SFCL-%'
            }
        },
        order: [['id', 'DESC']],
        transaction: t
    });

    let nextNumber = 1;

    if (lastClassified && lastClassified.number_registry) {
        const parts = lastClassified.number_registry.split('-');
        const lastNumber = parseInt(parts[1]) || 0;
        nextNumber = lastNumber + 1;
    }

    classified_data.number_registry = get_num_request('SFCL-', nextNumber, 5);
}

        /*Creación de clasificación*/
        const classified = await Classified.create(classified_data, { transaction: t });
        const count_classifieds = await Classified.count({ where: {id_sucursal}, transaction: t });
        const cod = get_num_request('CL',count_classifieds,5);
        classified.cod = cod;
        await classified.save({transaction: t});
        const id_classified = classified.id;
        const stock = await Stock.findOne({
            where: { id_product, id_sucursal, id_storage, status: true },
            include: [{association:'product', required:true, attributes: ['name','cod']}],
            lock: true,
            transaction: t
        });
        //??ERROR STOCK INSUFICIENTE
        const availability = await hasAvailableStock(stock, quantity_product, t);
        if(!availability.sufficient){
            await t.rollback();
            return res.status(422).json({
                ok: false,
                errors: [
                    { msg: `${stock.product.cod} - ${stock.product.name} no tiene suficiente stock disponible. Físico: ${availability.physical_stock}, en revisión: ${availability.stock_in_review}, disponible: ${availability.available_stock}.`}
                ],
            });
        }
        await applyDerivedStockEffect({
            productId: id_product, sucursalId: id_sucursal, storageId: id_storage,
            quantity: quantity_product, direction: 'OUTPUT', transaction: t,
        });
        /* Ingreso de detalles de la clasificación */
        const createdDetails = [];
        for (const detail of classified_details) {
            detail.id_classified = id_classified;
            const createdDetail = await DetailsClassified.create(detail,{ transaction: t });
            createdDetails.push(createdDetail);
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, transaction: t,
            });
        }
        await recordClassificationValuation({ classified, details: createdDetails, transaction: t });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
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
        const integrityLocations = [
            { productId: id_product, sucursalId: id_sucursal, storageId: id_storage },
            ...classified_anular.detailsClassified.map(({ id_product: detailProductId }) => ({ productId: detailProductId, sucursalId: id_sucursal, storageId: id_storage })),
        ];
        const beforeIntegrity = await Promise.all(integrityLocations.map((location) => getStockKardexIntegrity({ ...location, transaction: t })));
        /*ANULAR PRODUCTO CLASIFICADO*/
        const stock = await Stock.findOne({
            where: { id_product, id_sucursal, id_storage, status: true },
            lock: true,
            transaction: t
        });
        await applyDerivedStockEffect({
            productId: id_product, sucursalId: id_sucursal, storageId: id_storage,
            quantity: quantity_product, transaction: t,
        });
        /*ANULAR DETALLE CLASIFICADO*/
        for (const detail of classified_anular.detailsClassified) {
            const stock = await Stock.findOne({
                where: { id_product:detail.id_product, id_sucursal, id_storage, status: true },
                lock: true,
                transaction: t
            });
            const detailAvailability = await hasAvailableStock(stock, detail.quantity, t);
            if (!detailAvailability.sufficient) {
                await t.rollback();
                return res.status(422).json({
                    ok: false,
                    errors: [{ msg: `No se puede anular la clasificación: el producto ${detail.id_product} tiene sólo ${detailAvailability.available_stock} de stock disponible.` }],
                });
            }
            await applyDerivedStockEffect({
                productId: detail.id_product, sucursalId: id_sucursal, storageId: id_storage,
                quantity: detail.quantity, direction: 'OUTPUT', transaction: t,
            });
            await valuedKardex.reverseOriginal({
                originalSourceType: 'CLASSIFICATION_INPUT', originalSourceId: classified_anular.id,
                originalSourceDetailId: detail.id, sourceType: 'REVERSAL',
                sourceId: `CLASSIFICATION_CANCELLATION:${classified_anular.id}`, sourceDetailId: detail.id,
                effectType: 'REVERSE_CLASSIFICATION_INPUT', id_user: req.userAuth.id, movementDate: new Date(),
                id_product: detail.id_product, id_sucursal, id_storage, transaction: t,
            });
        }
        await valuedKardex.reverseOriginal({
            originalSourceType: 'CLASSIFICATION_OUTPUT', originalSourceId: classified_anular.id,
            sourceType: 'REVERSAL', sourceId: `CLASSIFICATION_CANCELLATION:${classified_anular.id}`,
            effectType: 'REVERSE_CLASSIFICATION_OUTPUT', id_user: req.userAuth.id, movementDate: new Date(),
            id_product, id_sucursal, id_storage, transaction: t,
        });
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
        await verifyLocationsIntegrityPreserved({ locations: integrityLocations, beforeDiagnostics: beforeIntegrity, transaction: t });
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
    getClassifiedFindOne,
    newClassified,
    destroyClassified
};

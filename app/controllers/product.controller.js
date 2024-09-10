const { response, request } = require('express');
const { Product, Price, sequelize,Stock,ProductSucursals,Kardex, ProductCosts } = require('../database/config');
const paginate = require('../helpers/paginate');
const get_num_request = require('../helpers/generate-cod');
const { fileMoveAndRemoveOld, deleteFile } = require('../helpers/file-upload');
const path = require('path');
const { Op } = require('sequelize');
const { returnDataKardexInput } = require('../helpers/kardex');

const getProductPaginate = async (req = request, res = response) => {
    try {
        let {query, page, limit, type, status, stock,id_sucursal,id_storage,orderNew} = req.query;
        const user = req.userAuth;
        let idsProductBySucursal = await ProductSucursals.findAll({where: {status:true, id_sucursal}});
        idsProductBySucursal = idsProductBySucursal.map(resp => resp.id_product);
        let isSearchPos = type === 'pos' ? true : false;   
        let optionsDb = {
            order: [orderNew],
            where: { 
                status,
                id: { [Op.in]: idsProductBySucursal }
            },
            include: [
                { association: 'category' },
                { association: 'unit' },
                { association: 'prices',required:false, where: {status: true}},
                { association: 'stocks', attributes: ['stock','stock_min'],
                    required:false, where: {status: true},
                    include: [
                        {association: 'sucursal', attributes: ['id','name']},
                        {association: 'storage', attributes:['id','name']}
                    ]
                },
            ]
        };
        /* Search product, for POS */
        if(isSearchPos) type = null;
        if(isSearchPos) optionsDb.where[Op.or] = [
            { cod: { [Op.iLike]: `%${query}%`}},
            { name: { [Op.iLike]: `%${query}%`}},
            { description: { [Op.iLike]: `%${query}%`}},
        ];
        let products = await paginate(Product, page, limit, type, query, optionsDb); 
        // //*filterStockByUser by sucursal assignate*/
        if(user.role != 'ADMINISTRADOR'){
            products.data = products.data.map((product) => {
                const new_stock = product.stocks.filter((stock) =>
                    user?.assign_sucursales.some((resp) => stock.sucursal.id === resp.id_sucursal)
                );
                product.dataValues.stocks = new_stock;
                return product;
            });
        }
        // //*Suma stock by sucursal and storage*/
        let stocksNew;
        if(stock && id_sucursal && id_storage) {
            products.data = products.data.map((product) => {
                stocksNew = product.stocks?.filter((stock) =>
                    stock.sucursal.id == id_sucursal && stock.storage.id == id_storage
                );
                product.dataValues.stocks = stocksNew;
                product.dataValues.total_stock = stocksNew.reduce( (sum, product) => Number(sum) + Number(product.stock),0);
                product.dataValues.price_select = product?.prices[0]?.price ?? 0;
                return product;
            });
        } else {
            products.data.map(product => product.dataValues.total_stock = 0);
        }
        return res.status(200).json({
            ok: true,
            products
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getOneProductSucursal = async(req = request, res = response) => {
    try {
        let { id_product } = req.query;
        const productSucursals = await ProductSucursals.findAll({where: {status:true, id_product}});
        return res.status(200).json({
            ok: true,
            productSucursals
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const getProductCostsSucursal = async(req = request, res = response) => {
    try {
        let { query, page, limit, type, id_sucursal, id_category, orderNew } = req.query;
        let idsProductBySucursal = await ProductSucursals.findAll({where: {status:true, id_sucursal}});
        idsProductBySucursal = idsProductBySucursal.map(resp => resp.id_product);
        let optionsDb = {
            order: [orderNew],
            attributes: ['id','cod', 'name', 'description', 'costo'],
            where: { 
                [Op.and]: [
                    id_category   ? { id_category   } : {},
                    {status: true},
                    {id: { [Op.in]: idsProductBySucursal }}
                ]
            },
            include: [
                { association: 'productCosts', required: false ,where: {status: true} ,attributes: ['cost_two', 'cost_tree'] },
            ]
        };
        let products = await paginate(Product, page, limit, type, query, optionsDb);
        products.data = products.data.map((product) => {
            if(product.dataValues.productCosts){
                product.dataValues.productCosts = {cost: product.costo ,...product.productCosts.dataValues};
            } else {
                product.dataValues.productCosts = {cost: product.costo,cost_two:"0",cost_tree:"0" };
            }
            return product;
        });
        return res.status(200).json({
            ok: true,
            products
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const updateProductsCostos = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        let body = req.body;
        let {id:id_product, productCosts, id_sucursal} = body;
        await Product.update({costo: productCosts.cost},{where: {id:id_product},transaction: t});     
        const findProductCost = await ProductCosts.findOne({where: {id_product, id_sucursal, status: true},transaction: t});
        const dataProductCost = {
            id_product, id_sucursal,
            cost_two: productCosts.cost_two,
            cost_tree: productCosts.cost_tree,
            status: true
        }
        if(findProductCost){
            await ProductCosts.update(dataProductCost, { where: { id_product, id_sucursal}, transaction: t });
        } else {
            await ProductCosts.create(dataProductCost,  { transaction: t })
        }
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: "Modificado correctamente"
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

const productAssignatSucursals = async(req = request, res = response) => {
    try {
        let { id_product, sucursalesAssign } = req.body;
        await ProductSucursals.destroy({where: {id_product}});
        await ProductSucursals.bulkCreate(sucursalesAssign);
        return res.status(200).json({
            ok: true,
            msg:'asignado correctamente'
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            ok: false,
            errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newProduct = async (req = request, res = response ) => {
    const t = await sequelize.transaction();
    try {
        let body = req.body;
        let {id_sucursal, id_storage, stock} = body;
        body.img = 'NONE';
        const product = await Product.create(body, { transaction: t });
        const cod = body.cod ?  body.cod : get_num_request('PRO',product.id,5);
        const [_,productUpdate] = await Product.update({ cod }, { where: { id: product.id }, returning: true,plain: true, transaction: t });
        await Price.create({
            name: 'PRECIO INICIAL',
            price: body.precio_venta,
            profit_margin: body.margen_utilidad,
            id_product: product.id,
            status: true,
        }, { transaction: t });
        await ProductSucursals.create({
            id_sucursal: id_sucursal,
            id_product: product.id,
            status: true,
        }, { transaction: t });
        if(Number(stock) > 0) {
            //kardex
            detailKardex = product;
            detailKardex.cost       = product.costo;
            detailKardex.quantity   = stock;
            detailKardex.id_product = product.id;
            const data_new = returnDataKardexInput(`INV. INICIAL`,null,null,'0000', null,detailKardex,null, null, id_sucursal, id_storage);
            await Kardex.create(data_new,{ transaction: t });
            //stock
            await Stock.create({
                stock_min: 1, stock: stock,
                id_product: product.id, id_sucursal, id_storage,
                status: true,
            },{ transaction: t });
        }
       
        await t.commit();
        return res.status(201).json({
            ok: true,
            product: body.cod ? product : productUpdate
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

const updateProduct = async (req = request, res = response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const body = req.body;
        const product = await Product.findByPk(id, { transaction: t });
        body.cod = body.cod ?  body.cod : get_num_request('PRO',product.id,5);
        if(product.img != 'NONE' && body.img == 'NONE') { //Borro la imagen del producto
            deleteFile(path.join(__dirname, '../../uploads/imgs', 'products', product.img));     
        } 
        await product.update(body, { transaction: t });
        await t.commit();
        return res.status(201).json({
            ok: true,
            msg: 'Producto modificada exitosamente'
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

const activeInactiveProduct = async (req = request, res = response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const product = await Product.findByPk(id);
        await product.update({status});
        return res.status(201).json({
            ok: true,
            msg: status ? 'Producto activada exitosamente' : 'Producto inactiva exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const newPriceProduct = async (req = request, res = response ) => {
    try {
        const body = req.body;
        const price = await Price.create(body);
        return res.status(201).json({
            ok: true,
            price
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const deletePriceProduct = async (req = request, res = response ) => {
    try {
        const { id } = req.params;
        const price = await Price.findByPk(id);
        await price.update({status:false});
        return res.status(201).json({
            ok: true,
            msg: 'Precio eliminado exitosamente'
        });   
    } catch (error) {
        console.log(error);
        return res.status(500).json({
          ok: false,
          errors: [{ msg: `Ocurrió un imprevisto interno | hable con soporte`}],
        });
    }
}

const uploadFileProduct = async (req, res) => {
    const { idProduct } = req.query;
    const {keyFile, file } = req;
    let productDB = await Product.findByPk(idProduct);
    try {
      if(!productDB[keyFile]) {
        return res.json({
          ok: false,
          msg: `El valor ${keyFile} no existe en la base de datos`,
        })  
      }
      productDB[keyFile] = await fileMoveAndRemoveOld(file,productDB[keyFile],idProduct,'imgs/products');
      await productDB.save();
      return res.json({
        ok: true,
        msg: `Imagen subida correctamente`,
      }); 
    } catch (error) {
      console.log(error);
      return res.status(422).json({
        ok: false,
        errors: [{msg: `No se pudo subir tu archivo - ${error}`,}]
      });
    }
  };

module.exports = {
    getProductPaginate,
    newProduct,
    updateProduct,
    activeInactiveProduct,
    newPriceProduct,
    deletePriceProduct,
    uploadFileProduct,
    getOneProductSucursal,
    productAssignatSucursals,
    getProductCostsSucursal,
    updateProductsCostos
};

'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {
      Product.belongsTo(models.Category,{as: 'category', foreignKey:'id_category'});
      Product.belongsTo(models.Unit,{as: 'unit', foreignKey:'id_unit'});
      Product.hasMany(models.Price,{as: 'prices', foreignKey:'id_product'});
      Product.hasMany(models.Stock,{as: 'stocks', foreignKey:'id_product'});
      Product.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_product'});
      Product.hasMany(models.Kardex,{as: 'kardexProduct', foreignKey:'id_product_classified'});
      Product.hasMany(models.DetailsInput,{as: 'detailsInput', foreignKey:'id_product'});
      Product.hasMany(models.DetailsOutput,{as: 'detailsOutput', foreignKey:'id_product'});
      Product.hasMany(models.Classified,{as: 'classified', foreignKey:'id_product'});
      Product.hasMany(models.DetailsClassified,{as: 'detailsClassified', foreignKey:'id_product'});
      Product.hasMany(models.DetailsTransfers,{as: 'detailsTransfers', foreignKey:'id_product'});
      Product.hasOne(models.ProductCosts,{as: 'productCosts', foreignKey:'id_product'});
    }
  }
  Product.init({
    cod: DataTypes.STRING,
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    costo: DataTypes.DECIMAL,
    inventariable: DataTypes.BOOLEAN,
    img: DataTypes.STRING,
    id_category: DataTypes.INTEGER,
    id_unit: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Product',
    tableName: 'products'
  });
  return Product;
};
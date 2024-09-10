'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProductSucursals extends Model {
    static associate(models) {}
  }
  ProductSucursals.init({
    id_product: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'ProductSucursals',
    tableName: 'products_sucursals'
  });
  return ProductSucursals;
};
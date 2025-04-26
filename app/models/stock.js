'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class Stock extends Model {
    static associate(models) {
      Stock.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
      Stock.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Stock.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
    }
  }
  Stock.init({
    stock_min: DataTypes.DECIMAL,
    stock: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('stock', formattedDecimalSetter(value));
      }
    },
    id_product: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Stock',
    tableName: 'stocks'
  });
  return Stock;
};
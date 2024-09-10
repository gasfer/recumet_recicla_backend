'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Price extends Model {
    static associate(models) {
      Price.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  Price.init({
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL,
    profit_margin: DataTypes.DECIMAL,
    id_product: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Price',
    tableName: 'prices'
  });
  return Price;
};
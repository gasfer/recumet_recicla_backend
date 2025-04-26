'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class Price extends Model {
    static associate(models) {
      Price.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  Price.init({
    name: DataTypes.STRING,
    price: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('price', formattedDecimalSetter(value));
      }
    },
    profit_margin: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('profit_margin', formattedDecimalSetter(value));
      }
    },
    id_product: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Price',
    tableName: 'prices'
  });
  return Price;
};
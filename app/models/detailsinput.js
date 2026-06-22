'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalQuantitySetter, formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class DetailsInput extends Model {
    static associate(models) {
      DetailsInput.belongsTo(models.Input,{as: 'input', foreignKey:'id_input'});
      DetailsInput.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsInput.init({
    quantity: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity', formattedDecimalQuantitySetter(value));
      }
    },
    cost: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost', formattedDecimalSetter(value));
      }
    },
    total: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('total', formattedDecimalSetter(value));
      }
    },
    expiration_date: DataTypes.DATE,
    profit_margin: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('profit_margin', formattedDecimalSetter(value));
      }
    },
    id_input: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'DetailsInput',
    tableName: 'details_inputs'
  });
  return DetailsInput;
};
'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalQuantitySetter, formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class DetailsOutput extends Model {
    static associate(models) {
      DetailsOutput.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      DetailsOutput.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsOutput.init({
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
    price: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('price', formattedDecimalSetter(value));
      }
    },
    total: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('total', formattedDecimalSetter(value));
      }
    },
    id_output: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'DetailsOutput',
    tableName: 'details_outputs',
  });
  return DetailsOutput;
};
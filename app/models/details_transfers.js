'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter, formattedDecimalQuantitySetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class DetailsTransfers extends Model {
    static associate(models) {
      DetailsTransfers.belongsTo(models.Transfers,{as: 'transfers', foreignKey:'id_transfer'});
      DetailsTransfers.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsTransfers.init({
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
    id_transfer: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
  }, {
    sequelize,
    modelName: 'DetailsTransfers',
    tableName: 'details_transfers'
  });
  return DetailsTransfers;
};
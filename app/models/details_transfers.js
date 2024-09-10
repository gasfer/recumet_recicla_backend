'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DetailsTransfers extends Model {
    static associate(models) {
      DetailsTransfers.belongsTo(models.Transfers,{as: 'transfers', foreignKey:'id_transfer'});
      DetailsTransfers.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsTransfers.init({
    quantity: DataTypes.DECIMAL,
    cost: DataTypes.DECIMAL,
    total: DataTypes.DECIMAL,
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
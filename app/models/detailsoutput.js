'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DetailsOutput extends Model {
    static associate(models) {
      DetailsOutput.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      DetailsOutput.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsOutput.init({
    quantity: DataTypes.DECIMAL,
    cost: DataTypes.DECIMAL,
    price: DataTypes.DECIMAL,
    total: DataTypes.DECIMAL,
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
'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DetailsInput extends Model {
    static associate(models) {
      DetailsInput.belongsTo(models.Input,{as: 'input', foreignKey:'id_input'});
      DetailsInput.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsInput.init({
    quantity: DataTypes.DECIMAL,
    cost: DataTypes.DECIMAL,
    total: DataTypes.DECIMAL,
    expiration_date: DataTypes.DATE,
    profit_margin: DataTypes.DECIMAL,
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
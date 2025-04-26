'use strict';
const { Model } = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class ProductCosts extends Model {
    static associate(models) {
      ProductCosts.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      ProductCosts.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  ProductCosts.init({
    id_product: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    cost_two: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_two', formattedDecimalSetter(value));
      }
    },
    cost_tree: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_tree', formattedDecimalSetter(value));
      }
    },
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'ProductCosts',
    tableName: 'products_costs'
  });
  return ProductCosts;
};
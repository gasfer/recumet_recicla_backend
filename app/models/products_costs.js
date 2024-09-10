'use strict';
const { Model } = require('sequelize');
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
    cost_two:DataTypes.DECIMAL,
    cost_tree: DataTypes.DECIMAL,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'ProductCosts',
    tableName: 'products_costs'
  });
  return ProductCosts;
};
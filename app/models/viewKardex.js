'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ViewKardex extends Model {
    static associate(models) {
      ViewKardex.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
      ViewKardex.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      ViewKardex.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
    }
  }
  ViewKardex.init({
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    id_movement: DataTypes.INTEGER,
    type_movement: DataTypes.STRING,
    registry_number: DataTypes.STRING,
    detail: DataTypes.STRING,
    sub_detail: DataTypes.STRING,
    id_product: DataTypes.INTEGER,
    quantity: DataTypes.DECIMAL,
    quantity_input: DataTypes.DECIMAL,
    quantity_output: DataTypes.DECIMAL,
    cost_unitario: DataTypes.DECIMAL,
    cost_input: DataTypes.DECIMAL,
    cost_output: DataTypes.DECIMAL,
    saldo_inicial: DataTypes.DECIMAL,
    saldo: DataTypes.DECIMAL,
    cost_saldo: DataTypes.DECIMAL,
    
   
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'ViewKardex',
    tableName: 'view_kardex_detalle'
  });
  return ViewKardex;
};
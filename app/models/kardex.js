'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Kardex extends Model {
    static associate(models) {
      Kardex.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
      Kardex.belongsTo(models.Product,{as: 'productClassified', foreignKey:'id_product_classified'});
      Kardex.belongsTo(models.Input,{as: 'input', foreignKey:'id_input'});
      Kardex.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      Kardex.belongsTo(models.Client,{as: 'client', foreignKey:'id_client'});
      Kardex.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      Kardex.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Kardex.belongsTo(models.Sucursal,{as: 'sucursalOriginDestination', foreignKey:'id_sucursal_origin_destination'});
      Kardex.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
    }
  }
  Kardex.init({
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    detalle: DataTypes.TEXT,
    document: DataTypes.STRING,

    quantity_inicial: DataTypes.DECIMAL,
    price_u_inicial: DataTypes.DECIMAL,
    cost_u_inicial: DataTypes.DECIMAL,
    cost_total_inicial: DataTypes.DECIMAL,

    quantity_input: DataTypes.DECIMAL,
    cost_u_input: DataTypes.DECIMAL,
    cost_total_input: DataTypes.DECIMAL,
    
    quantity_output: DataTypes.DECIMAL,
    cost_u_output: DataTypes.DECIMAL,
    cost_total_output: DataTypes.DECIMAL,

    quantity_saldo: DataTypes.DECIMAL,
    cost_u_saldo: DataTypes.DECIMAL,
    cost_total_saldo: DataTypes.DECIMAL,

    id_product: DataTypes.INTEGER,
    id_product_classified: DataTypes.INTEGER,
    id_sucursal_origin_destination: DataTypes.INTEGER,
    id_input: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
    id_output: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,

    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Kardex',
    tableName: 'kardexes'
  });
  return Kardex;
};
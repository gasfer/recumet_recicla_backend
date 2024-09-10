'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Sucursal extends Model {
    static associate(models) {
      Sucursal.belongsTo(models.Company,{as: 'company', foreignKey:'id_company'});
      Sucursal.hasMany(models.Client,{as: 'client', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.assignSucursales,{as: 'assign_sucursales', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Storage,{as: 'storage', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Provider,{as: 'provider', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.History,{as: 'history', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Stock,{as: 'stock', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Kardex,{as: 'kardexOriginDestination', foreignKey:'id_sucursal_origin_destination'});
      Sucursal.hasMany(models.Input,{as: 'input', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Output,{as: 'outputs', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Classified,{as: 'classified', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.ProductCosts,{as: 'productCosts', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.AccountsPayable,{as: 'accountsPayable', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.AccountsReceivable,{as: 'accountsReceivable', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.CajaSmall,{as: 'cajaSmall', foreignKey:'id_sucursal'});
      Sucursal.hasMany(models.Transfers,{as: 'transfers_send', foreignKey:'id_sucursal_send'});
      Sucursal.hasMany(models.Transfers,{as: 'transfers_received', foreignKey:'id_sucursal_received'});
    }
  }
  Sucursal.init({
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    type: DataTypes.STRING,
    city: DataTypes.STRING,
    address: DataTypes.STRING,
    id_company: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Sucursal',
    tableName: 'sucursals'
  });
  return Sucursal;
};
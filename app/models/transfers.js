'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Transfers extends Model {
    static associate(models) {
      Transfers.belongsTo(models.Sucursal,{as: 'sucursal_send', foreignKey:'id_sucursal_send'});
      Transfers.belongsTo(models.Sucursal,{as: 'sucursal_received', foreignKey:'id_sucursal_received'});
      Transfers.belongsTo(models.Storage, {as: 'storage_send',  foreignKey:'id_storage_send'});
      Transfers.belongsTo(models.Storage, {as: 'storage_received',  foreignKey:'id_storage_received'});
      Transfers.belongsTo(models.User,    {as: 'user_send',     foreignKey:'id_user_send'});
      Transfers.belongsTo(models.User,    {as: 'user_received',     foreignKey:'id_user_received'});
      Transfers.hasMany(models.DetailsTransfers,{as: 'detailsTransfers', foreignKey:'id_transfer'});
    }
  }
  Transfers.init({
    cod: DataTypes.STRING,
    date_send: DataTypes.DATE,
    date_received: DataTypes.DATE,
    observations_send: DataTypes.TEXT,
    observations_received: DataTypes.TEXT,
    total: DataTypes.DECIMAL,
    id_sucursal_send: DataTypes.INTEGER,
    id_storage_send: DataTypes.INTEGER,
    id_sucursal_received: DataTypes.INTEGER,
    id_storage_received: DataTypes.INTEGER,
    id_user_send: DataTypes.INTEGER,
    id_user_received: DataTypes.INTEGER,
    status: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'Transfers',
    tableName: 'transfers',
  });
  return Transfers;
};
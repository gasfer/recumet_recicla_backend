'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Storage extends Model {
    static associate(models) {
      Storage.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Storage.hasMany(models.Stock,{as: 'stock', foreignKey:'id_storage'});
      Storage.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_storage'});
      Storage.hasMany(models.Input,{as: 'input', foreignKey:'id_storage'});
      Storage.hasMany(models.Output,{as: 'outputs', foreignKey:'id_storage'});
      Storage.hasMany(models.Classified,{as: 'classified', foreignKey:'id_storage'});
      Storage.hasMany(models.Transfers,{as: 'transfers_send', foreignKey:'id_storage_send'});
      Storage.hasMany(models.Transfers,{as: 'transfers_received', foreignKey:'id_storage_received'});
    }
  }
  Storage.init({
    name: DataTypes.STRING,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Storage',
    tableName: 'storages'
  });
  return Storage;
};
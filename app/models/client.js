'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Client extends Model {
    static associate(models) {
      Client.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Client.hasMany(models.Output,{as: 'outputs', foreignKey:'id_client'});
      Client.hasMany(models.AccountsReceivable,{as: 'accounts_receivable', foreignKey:'id_client'});
      Client.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_client'});
    }
  }
  Client.init({
    cod: DataTypes.STRING,
    full_names: DataTypes.STRING,
    number_document: DataTypes.STRING,
    razon_social: DataTypes.STRING,
    email: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    business_name: DataTypes.STRING,
    address: DataTypes.STRING,
    type: DataTypes.STRING,
    photo: DataTypes.STRING,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Client',
    tableName: 'clients'
  });
  return Client;
};
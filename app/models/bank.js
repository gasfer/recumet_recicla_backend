'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Bank extends Model {
   
    static associate(models) {
      Bank.hasMany(models.Input,{as: 'input', foreignKey:'id_bank'});
      Bank.hasMany(models.Output,{as: 'outputs', foreignKey:'id_bank'});
      Bank.hasMany(models.DetailsCajaSmall,{as: 'detailsCajaSmall', foreignKey:'id_bank'});
      Bank.hasMany(models.AbonosAccountsPayable,{as: 'bankDestination', foreignKey:'id_bank'});
      Bank.hasMany(models.AbonosAccountsPayable,{as: 'bankOrigin', foreignKey:'id_bank_origin'});
      Bank.hasMany(models.AbonosAccountsPayableMultiple,{as: 'abonosMultipleDestination', foreignKey:'id_bank'});
      Bank.hasMany(models.AbonosAccountsPayableMultiple,{as: 'abonosMultipleOrigin', foreignKey:'id_bank_origin'});
    }
  }
  Bank.init({
    name: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Bank',
    tableName: 'banks'
  });
  return Bank;
};
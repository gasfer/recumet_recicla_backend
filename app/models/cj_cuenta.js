'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjAccount extends Model {
    static associate(models) {
      CjAccount.belongsTo(models.Bank, { as: 'bank', foreignKey: 'id_bank' });
      CjAccount.hasMany(models.CjAccountAssignment, { as: 'assignments', foreignKey: 'id_cuenta' });
      CjAccount.hasMany(models.CjSessionBalance, { as: 'sessionBalances', foreignKey: 'id_cuenta' });
      CjAccount.hasMany(models.CjLedger, { as: 'ledgerEntries', foreignKey: 'id_cuenta' });
    }
  }
  CjAccount.init({ code: DataTypes.STRING, name: DataTypes.STRING, type: DataTypes.STRING, currency: DataTypes.STRING, id_bank: DataTypes.INTEGER, account_reference: DataTypes.STRING, is_active: DataTypes.BOOLEAN }, { sequelize, modelName: 'CjAccount', tableName: 'cj_cuentas' });
  return CjAccount;
};

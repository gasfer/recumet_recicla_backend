'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderBankAccount extends Model {
    static associate(models) {
      ProviderBankAccount.belongsTo(models.Provider, { as: 'provider', foreignKey: 'id_provider' });
      ProviderBankAccount.belongsTo(models.Bank, { as: 'bank', foreignKey: 'id_bank' });
    }
  }

  ProviderBankAccount.init({
    id_provider: DataTypes.INTEGER,
    id_bank: DataTypes.INTEGER,
    account_holder: DataTypes.STRING,
    account_number: DataTypes.STRING,
    account_type: DataTypes.ENUM('CAJA_AHORRO', 'CUENTA_CORRIENTE', 'OTRA'),
    currency: DataTypes.ENUM('BOB', 'USD'),
    is_main: DataTypes.BOOLEAN,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderBankAccount', tableName: 'provider_bank_accounts' });

  return ProviderBankAccount;
};

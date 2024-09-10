'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AccountsPayable extends Model {
    static associate(models) {
      AccountsPayable.hasMany(models.AbonosAccountsPayable,{as: 'abonosAccountsPayable', foreignKey:'id_account_payable'});
      AccountsPayable.belongsTo(models.Input,{as: 'input', foreignKey:'id_input'});
      AccountsPayable.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      AccountsPayable.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  AccountsPayable.init({
    cod: DataTypes.STRING,
    id_input: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    description: DataTypes.STRING,
    date_credit: DataTypes.DATE,
    total: DataTypes.DECIMAL,
    monto_abonado: DataTypes.DECIMAL,
    monto_restante: DataTypes.DECIMAL,
    id_sucursal: DataTypes.INTEGER,
    status_account:  DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'AccountsPayable',
    tableName: 'accounts_payables'
  });
  return AccountsPayable;
};
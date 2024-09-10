'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AccountsReceivable extends Model {
    static associate(models) {
      AccountsReceivable.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      AccountsReceivable.belongsTo(models.Client,{as: 'client', foreignKey:'id_client'});
      AccountsReceivable.hasMany(models.AbonosAccountsReceivable,{as: 'abonosAccountsReceivable', foreignKey:'id_account_receivable'});
      AccountsReceivable.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  AccountsReceivable.init({
    cod: DataTypes.STRING,
    id_output: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
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
    modelName: 'AccountsReceivable',
    tableName: 'accounts_receivable'
  });
  return AccountsReceivable;
};
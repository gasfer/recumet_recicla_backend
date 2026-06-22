'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
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
    total: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('total', formattedDecimalSetter(value));
      }
    },
    monto_abonado: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_abonado', formattedDecimalSetter(value));
      }
    },
    monto_restante: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_restante', formattedDecimalSetter(value));
      }
    },
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
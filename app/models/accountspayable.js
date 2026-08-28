'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
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
    status: DataTypes.BOOLEAN,
    updated_by: DataTypes.INTEGER,
    voided_by: DataTypes.INTEGER,
    voided_at: DataTypes.DATE,
    void_reason: DataTypes.TEXT,
    superseded_by: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AccountsPayable',
    tableName: 'accounts_payables'
  });
  return AccountsPayable;
};

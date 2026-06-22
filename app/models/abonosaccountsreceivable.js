'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsReceivable extends Model {
    static associate(models) {
      AbonosAccountsReceivable.belongsTo(models.AccountsReceivable,{as: 'accountsReceivable', foreignKey:'id_account_receivable'});
      AbonosAccountsReceivable.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
    }
  }
  AbonosAccountsReceivable.init({
    id_account_receivable: DataTypes.INTEGER,
    date_abono: DataTypes.DATE,
    monto_abono: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_abono', formattedDecimalSetter(value));
      }
    },
    total_abonado: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('total_abonado', formattedDecimalSetter(value));
      }
    },
    restante_credito: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('restante_credito', formattedDecimalSetter(value));
      }
    },
    id_user: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    comments: DataTypes.TEXT,
    type_payment: DataTypes.STRING,
    account_input: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    from_pay_multiple: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'AbonosAccountsReceivable',
    tableName: 'abonos_accounts_receivable'
  });
  return AbonosAccountsReceivable;
};
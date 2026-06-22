'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsPayable extends Model {
    static associate(models) {
      AbonosAccountsPayable.belongsTo(models.AccountsPayable,{as: 'accountsPayable', foreignKey:'id_account_payable'});
      AbonosAccountsPayable.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      AbonosAccountsPayable.belongsTo(models.Bank,{as: 'bankDestination', foreignKey:'id_bank'});
      AbonosAccountsPayable.belongsTo(models.Bank,{as: 'bankOrigin', foreignKey:'id_bank_origin'});
    }
  }
  AbonosAccountsPayable.init({
    id_account_payable: DataTypes.INTEGER,
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
    account_output: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    from_pay_multiple: DataTypes.BOOLEAN,
    account_origin: DataTypes.STRING,
    id_bank_origin: DataTypes.INTEGER,
    payment_voucher: DataTypes.STRING,
    number_transaction: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'AbonosAccountsPayable',
    tableName: 'abonos_accounts_payables'
  });
  return AbonosAccountsPayable;
};
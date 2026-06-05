'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsPayableMultiple extends Model {
    static associate(models) {
      AbonosAccountsPayableMultiple.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      AbonosAccountsPayableMultiple.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      AbonosAccountsPayableMultiple.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      AbonosAccountsPayableMultiple.belongsTo(models.Bank,{as: 'abonosMultipleDestination', foreignKey:'id_bank'});
      AbonosAccountsPayableMultiple.belongsTo(models.Bank,{as: 'abonosMultipleOrigin', foreignKey:'id_bank_origin'});
    }
  }
  AbonosAccountsPayableMultiple.init({
    ids_account_payables: DataTypes.ARRAY(DataTypes.INTEGER),
    ids_abonos_payables: DataTypes.ARRAY(DataTypes.INTEGER),
    codes_input: DataTypes.ARRAY(DataTypes.STRING),
    date_abono: DataTypes.DATE,
    monto_abono: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_abono', formattedDecimalSetter(value));
      }
    },
    id_user: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    comments: DataTypes.TEXT,
    type_payment: DataTypes.STRING,
    account_output: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    id_sucursal: DataTypes.INTEGER,
    account_origin: DataTypes.STRING,
    id_bank_origin: DataTypes.INTEGER,
    payment_voucher: DataTypes.STRING,
    number_transaction: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'AbonosAccountsPayableMultiple',
    tableName: 'abonos_accounts_payables_multiple'
  });
  return AbonosAccountsPayableMultiple;
};
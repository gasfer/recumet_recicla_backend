'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsPayableMultiple extends Model {
    static associate(models) {
      AbonosAccountsPayableMultiple.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      AbonosAccountsPayableMultiple.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      AbonosAccountsPayableMultiple.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  AbonosAccountsPayableMultiple.init({
    ids_account_payables: DataTypes.ARRAY(DataTypes.INTEGER),
    ids_abonos_payables: DataTypes.ARRAY(DataTypes.INTEGER),
    codes_input: DataTypes.ARRAY(DataTypes.STRING),
    date_abono: DataTypes.DATE,
    monto_abono: DataTypes.DECIMAL,
    id_user: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    comments: DataTypes.TEXT,
    type_payment: DataTypes.STRING,
    account_output: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    id_sucursal: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'AbonosAccountsPayableMultiple',
    tableName: 'abonos_accounts_payables_multiple'
  });
  return AbonosAccountsPayableMultiple;
};
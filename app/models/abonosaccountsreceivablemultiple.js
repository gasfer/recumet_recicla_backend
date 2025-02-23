'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsReceivableMultiple extends Model {
    static associate(models) {
      AbonosAccountsReceivableMultiple.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      AbonosAccountsReceivableMultiple.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  AbonosAccountsReceivableMultiple.init({
    ids_account_receivables: DataTypes.ARRAY(DataTypes.INTEGER),
    ids_abonos_receivables: DataTypes.ARRAY(DataTypes.INTEGER),
    codes_output: DataTypes.ARRAY(DataTypes.STRING),
    date_abono: DataTypes.DATE,
    monto_abono: DataTypes.DECIMAL,
    id_user: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    comments: DataTypes.TEXT,
    type_payment: DataTypes.STRING,
    account_input: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'AbonosAccountsReceivableMultiple',
    tableName: 'abonos_accounts_receivables_multiple'
  });
  return AbonosAccountsReceivableMultiple;
};
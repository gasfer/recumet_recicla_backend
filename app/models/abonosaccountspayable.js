'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class AbonosAccountsPayable extends Model {
    static associate(models) {
      AbonosAccountsPayable.belongsTo(models.AccountsPayable,{as: 'accountsPayable', foreignKey:'id_account_payable'});
      AbonosAccountsPayable.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
    }
  }
  AbonosAccountsPayable.init({
    id_account_payable: DataTypes.INTEGER,
    date_abono: DataTypes.DATE,
    monto_abono: DataTypes.DECIMAL,
    total_abonado: DataTypes.DECIMAL,
    restante_credito: DataTypes.DECIMAL,
    id_user: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'AbonosAccountsPayable',
    tableName: 'abonos_accounts_payables'
  });
  return AbonosAccountsPayable;
};
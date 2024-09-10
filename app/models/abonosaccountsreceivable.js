'use strict';
const {
  Model
} = require('sequelize');
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
    monto_abono: DataTypes.DECIMAL,
    total_abonado: DataTypes.DECIMAL,
    restante_credito: DataTypes.DECIMAL,
    id_user: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'AbonosAccountsReceivable',
    tableName: 'abonos_accounts_receivable'
  });
  return AbonosAccountsReceivable;
};
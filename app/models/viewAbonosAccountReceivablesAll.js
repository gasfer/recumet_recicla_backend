'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class viewAbonosAccountReceivablesAll extends Model {
    static associate(models) {
      viewAbonosAccountReceivablesAll.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      viewAbonosAccountReceivablesAll.belongsTo(models.Client,{as: 'client', foreignKey:'id_client'});
      viewAbonosAccountReceivablesAll.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  viewAbonosAccountReceivablesAll.init({
    ids_account_receivables: DataTypes.ARRAY(DataTypes.INTEGER),
    ids_abonos_receivables: DataTypes.ARRAY(DataTypes.INTEGER),
    codes_output: DataTypes.ARRAY(DataTypes.STRING),
    date_abono: DataTypes.DATE,
    monto_abono: DataTypes.DECIMAL,
    id_user: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
    comments: DataTypes.TEXT,
    type_payment: DataTypes.STRING,
    account_input: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    id_sucursal:  DataTypes.INTEGER,
    from_pay_multiple: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'viewAbonosAccountReceivablesAll',
    tableName: 'view_abonos_accounts_receivables_all'
  });
  return viewAbonosAccountReceivablesAll;
};
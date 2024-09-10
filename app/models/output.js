'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Output extends Model {
    static associate(models) {
      Output.hasMany(models.DetailsOutput,{as: 'detailsOutput', foreignKey:'id_output'});
      Output.hasOne(models.AccountsReceivable,{as: 'accounts_receivable', foreignKey:'id_output'});
      Output.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_output'});
      Output.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      Output.belongsTo(models.Bank,{as: 'bank', foreignKey:'id_bank'});
      Output.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
      Output.belongsTo(models.Client,{as: 'client', foreignKey:'id_client'});
      Output.belongsTo(models.Scale,{as: 'scale', foreignKey:'id_scale'});
      Output.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Output.hasOne(models.OutputBig,{as: 'outputBig', foreignKey:'id_output'});
    }
  }
  Output.init({
    cod: DataTypes.STRING,
    voucher: DataTypes.STRING,
    date_output: DataTypes.DATE,
    total: DataTypes.DECIMAL,
    type_voucher: DataTypes.STRING,
    type_output: DataTypes.STRING,
    type_payment: DataTypes.STRING,
    sub_total: DataTypes.DECIMAL,
    discount: DataTypes.STRING,
    payment_cash: DataTypes.DECIMAL,
    payment_linea: DataTypes.DECIMAL,
    change_money: DataTypes.DECIMAL,
    account_output: DataTypes.STRING,
    agreed_date_output: DataTypes.DATE,
    comments: DataTypes.STRING,
    type_registry: DataTypes.STRING,
    number_registry: DataTypes.STRING,
    id_user: DataTypes.INTEGER,
    id_bank: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
    id_scale: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Output',
    tableName: 'outputs'
  });
  return Output;
};
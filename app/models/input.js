'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Input extends Model {
    static associate(models) {
      Input.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_input'});
      Input.hasMany(models.DetailsInput,{as: 'detailsInput', foreignKey:'id_input'});
      Input.hasOne(models.AccountsPayable,{as: 'accounts_payable', foreignKey:'id_input'});
      Input.belongsTo(models.Scale,{as: 'scale', foreignKey:'id_scales'});
      Input.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
      Input.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      Input.belongsTo(models.Bank,{as: 'bank', foreignKey:'id_bank'});
      Input.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      Input.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  Input.init({
    cod: DataTypes.STRING,
    date_voucher: DataTypes.DATE,
    type: DataTypes.STRING,
    type_payment: DataTypes.STRING,
    type_registry: DataTypes.STRING,
    registry_number: DataTypes.STRING,
    account_input: DataTypes.STRING,
    comments: DataTypes.TEXT,
    sumas: DataTypes.DECIMAL,
    discount: DataTypes.DECIMAL,
    total: DataTypes.DECIMAL,
    is_paid: DataTypes.STRING,
    id_scales: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    id_bank: DataTypes.INTEGER,
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Input',
    tableName: 'inputs'
  });
  return Input;
};
'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DetailsCajaSmall extends Model {
    static associate(models) {
      DetailsCajaSmall.belongsTo(models.CajaSmall,{as: 'cajaSmall', foreignKey:'id_caja_small'});
      DetailsCajaSmall.belongsTo(models.Bank,{as: 'bank', foreignKey:'id_bank'});
    }
  }
  DetailsCajaSmall.init({
    id_caja_small:DataTypes.INTEGER,
    date: DataTypes.DATE,
    type: DataTypes.STRING,
    type_payment: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    account_payment: DataTypes.STRING,
    monto: DataTypes.DECIMAL,
    description: DataTypes.TEXT,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'DetailsCajaSmall',
    tableName: 'details_caja_smalls'
  });
  return DetailsCajaSmall;
};
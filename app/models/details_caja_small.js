'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class DetailsCajaSmall extends Model {
    static associate(models) {
      DetailsCajaSmall.belongsTo(models.CajaSmall,{as: 'cajaSmall', foreignKey:'id_caja_small'});
      DetailsCajaSmall.belongsTo(models.Bank,{as: 'bank', foreignKey:'id_bank'});
      DetailsCajaSmall.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
      DetailsCajaSmall.hasMany(models.CjLedger, { as: 'ledgerEntries', foreignKey: 'id_detail_caja_small' });
      DetailsCajaSmall.hasOne(models.CjExpense, { as: 'expense', foreignKey: 'id_detail_caja_small' });
    }
  }
  DetailsCajaSmall.init({
    id_caja_small:DataTypes.INTEGER,
    date: DataTypes.DATE,
    type: DataTypes.STRING,
    type_payment: DataTypes.STRING,
    id_bank: DataTypes.INTEGER,
    account_payment: DataTypes.STRING,
    monto: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto', formattedDecimalSetter(value));
      }
    },
    description: DataTypes.TEXT,
    status: DataTypes.BOOLEAN,
    id_cuenta: DataTypes.INTEGER,
    id_user: DataTypes.INTEGER,
    source_type: DataTypes.STRING,
    source_id: DataTypes.STRING,
    idempotency_key: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'DetailsCajaSmall',
    tableName: 'details_caja_smalls'
  });
  return DetailsCajaSmall;
};

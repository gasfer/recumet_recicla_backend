'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjSessionBalance extends Model {
    static associate(models) {
      CjSessionBalance.belongsTo(models.CajaSmall, { as: 'session', foreignKey: 'id_caja_small' });
      CjSessionBalance.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
      CjSessionBalance.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }
  CjSessionBalance.init({ id_caja_small: DataTypes.INTEGER, id_cuenta: DataTypes.INTEGER, opening_amount: DataTypes.DECIMAL, currency: DataTypes.STRING, opening_observation: DataTypes.TEXT, id_user: DataTypes.INTEGER }, { sequelize, modelName: 'CjSessionBalance', tableName: 'cj_sesion_saldos' });
  return CjSessionBalance;
};

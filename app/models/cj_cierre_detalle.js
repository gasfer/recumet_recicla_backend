'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjDailyCloseDetail extends Model {
    static associate(models) {
      CjDailyCloseDetail.belongsTo(models.CjDailyClose, { as: 'close', foreignKey: 'id_cierre' });
      CjDailyCloseDetail.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
    }
  }
  CjDailyCloseDetail.init({ id_cierre: DataTypes.INTEGER, id_cuenta: DataTypes.INTEGER, currency: DataTypes.STRING, expected_amount: DataTypes.DECIMAL, counted_amount: DataTypes.DECIMAL, difference: DataTypes.DECIMAL, observations: DataTypes.TEXT }, { sequelize, modelName: 'CjDailyCloseDetail', tableName: 'cj_cierre_detalle' });
  return CjDailyCloseDetail;
};

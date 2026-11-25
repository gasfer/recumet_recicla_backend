'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjDailyClose extends Model {
    static associate(models) {
      CjDailyClose.belongsTo(models.CajaSmall, { as: 'session', foreignKey: 'id_caja_small' });
      CjDailyClose.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      CjDailyClose.hasMany(models.CjDailyCloseDetail, { as: 'details', foreignKey: 'id_cierre' });
    }
  }
  CjDailyClose.init({ id_caja_small: DataTypes.INTEGER, id_user: DataTypes.INTEGER, status: DataTypes.STRING, observations: DataTypes.TEXT, closed_at: DataTypes.DATE }, { sequelize, modelName: 'CjDailyClose', tableName: 'cj_cierre_diario' });
  return CjDailyClose;
};

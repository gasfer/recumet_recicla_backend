'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjCaja extends Model {
    static associate(models) {
      CjCaja.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      CjCaja.hasMany(models.CjAccountAssignment, { as: 'assignments', foreignKey: 'id_caja' });
      CjCaja.hasMany(models.CajaSmall, { as: 'sessions', foreignKey: 'id_caja' });
    }
  }
  CjCaja.init({ id_sucursal: DataTypes.INTEGER, name: DataTypes.STRING, cashbox_type: DataTypes.STRING, status: DataTypes.BOOLEAN }, { sequelize, modelName: 'CjCaja', tableName: 'cj_cajas' });
  return CjCaja;
};

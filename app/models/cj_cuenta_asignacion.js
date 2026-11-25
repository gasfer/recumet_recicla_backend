'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjAccountAssignment extends Model {
    static associate(models) {
      CjAccountAssignment.belongsTo(models.CjCaja, { as: 'caja', foreignKey: 'id_caja' });
      CjAccountAssignment.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
      CjAccountAssignment.belongsTo(models.User, { as: 'assignedBy', foreignKey: 'assigned_by' });
    }
  }
  CjAccountAssignment.init({ id_caja: DataTypes.INTEGER, id_cuenta: DataTypes.INTEGER, is_active: DataTypes.BOOLEAN, assigned_by: DataTypes.INTEGER }, { sequelize, modelName: 'CjAccountAssignment', tableName: 'cj_cuentas_asignaciones' });
  return CjAccountAssignment;
};

'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlantPersonnelBranch extends Model {
    static associate(models) {
      PlantPersonnelBranch.belongsTo(models.PlantPersonnel, { as: 'person', foreignKey: 'id_personal' });
      PlantPersonnelBranch.belongsTo(models.Sucursal, { as: 'branch', foreignKey: 'id_sucursal' });
      PlantPersonnelBranch.belongsTo(models.User, { as: 'assignedBy', foreignKey: 'assigned_by' });
    }
  }

  PlantPersonnelBranch.init({
    id_personal: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    assigned_by: DataTypes.INTEGER,
  }, { sequelize, modelName: 'PlantPersonnelBranch', tableName: 'rrhh_personal_planta_sucursales' });
  return PlantPersonnelBranch;
};

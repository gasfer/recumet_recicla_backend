'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class assignPermission extends Model {
    static associate(models) {
      assignPermission.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
    }
  }
  assignPermission.init({
    id_user: DataTypes.INTEGER,
    module: DataTypes.STRING,
    view: DataTypes.BOOLEAN,
    create: DataTypes.BOOLEAN,
    update: DataTypes.BOOLEAN,
    delete: DataTypes.BOOLEAN,
    reports: DataTypes.BOOLEAN,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'assignPermission',
    tableName: 'assign_permissions'
  });
  return assignPermission;
};
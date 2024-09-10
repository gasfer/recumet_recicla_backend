'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class assignSucursales extends Model {
    
    static associate(models) {
      assignSucursales.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      assignSucursales.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  assignSucursales.init({
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'assignSucursales',
    tableName: 'assign_sucursales'
  });
  return assignSucursales;
};
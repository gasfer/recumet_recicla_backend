'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class History extends Model {
    static associate(models) {
      History.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      History.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  History.init({
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    type: DataTypes.STRING,
    module: DataTypes.STRING,
    query: DataTypes.TEXT,
    action: DataTypes.STRING,
    id_reference: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'History',
    tableName: 'histories'
  });
  return History;
};
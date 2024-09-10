'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Sector extends Model {
    static associate(models) {
      Sector.hasMany(models.Provider,{as: 'provider', foreignKey:'id_sector'});
    }
  }
  Sector.init({
    name: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Sector',
    tableName: 'sectors'
  });
  return Sector;
};
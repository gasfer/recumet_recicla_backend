'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Unit extends Model {
    static associate(models) {
      Unit.hasMany(models.Product,{as: 'product', foreignKey:'id_unit'});
    }
  }
  Unit.init({
    name: DataTypes.STRING,
    siglas: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Unit',
    tableName: 'units',
  });
  return Unit;
};
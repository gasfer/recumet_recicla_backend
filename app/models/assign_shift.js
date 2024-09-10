'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class assignShift extends Model {
    
    static associate(models) {
      assignShift.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
    }
  }
  assignShift.init({
    id_user: DataTypes.INTEGER,
    number_day: DataTypes.INTEGER,
    day: DataTypes.STRING,
    hour_start: DataTypes.STRING,
    hour_end: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'assignShift',
    tableName: 'assign_shifts'
  });
  return assignShift;
};
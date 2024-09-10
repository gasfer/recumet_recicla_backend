'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Scale extends Model {
    static associate(models) {
      Scale.hasMany(models.Input,{as: 'input', foreignKey:'id_scales'});
      Scale.hasMany(models.Output,{as: 'outputs', foreignKey:'id_scale'});
      Scale.hasMany(models.Classified,{as: 'classified', foreignKey:'id_scale'});

    }
  }
  Scale.init({
    name: DataTypes.STRING,
    cellphone: DataTypes.STRING,
    address: DataTypes.TEXT,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Scale',
    tableName: 'scales'
  });
  return Scale;
};
'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TypesProvider extends Model {
    static associate(models) {
      TypesProvider.hasMany(models.Provider,{as: 'provider', foreignKey:'id_type_provider'});
    }
  }
  TypesProvider.init({
    name: DataTypes.STRING,
    code: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'TypesProvider',
    tableName: 'types_provider'
  });
  return TypesProvider;
};
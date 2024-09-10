'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Company extends Model {
    static associate(models) {
      Company.hasMany(models.Sucursal,{as: 'sucursal', foreignKey:'id_company'});
    }
  }
  Company.init({
    name: DataTypes.STRING,
    nit: DataTypes.STRING,
    razon_social: DataTypes.STRING,
    activity: DataTypes.TEXT,
    email: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    logo: DataTypes.STRING,
    address: DataTypes.STRING,
    decimals: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Company',
    tableName: 'companies',
  });
  return Company;
};
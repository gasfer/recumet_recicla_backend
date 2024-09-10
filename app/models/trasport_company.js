'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Trasport_company extends Model {
    static associate(models) {
      Trasport_company.hasMany(models.Cargo_truck,{as: 'cargo_trucks', foreignKey:'id_trasport_company'});
      Trasport_company.hasMany(models.Chauffeurs,{as: 'chauffeurs', foreignKey:'id_trasport_company'});
    }
  }
  Trasport_company.init({
    name: DataTypes.STRING,
    nit: DataTypes.STRING,
    city: DataTypes.STRING,
    address: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Trasport_company',
    tableName: 'trasport_companies'
  });
  return Trasport_company;
};
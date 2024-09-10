'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Cargo_truck extends Model {
    static associate(models) {
      Cargo_truck.belongsTo(models.Trasport_company,{as: 'trasport_company', foreignKey:'id_trasport_company'});
      Cargo_truck.hasOne(models.OutputBig,{as: 'outputBig', foreignKey:'id_cargo_truck'});
    }
  }
  Cargo_truck.init({
    placa: DataTypes.STRING,
    id_trasport_company: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Cargo_truck',
    tableName: 'cargo_trucks'
  });
  return Cargo_truck;
};
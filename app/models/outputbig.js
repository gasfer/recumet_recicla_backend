'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class OutputBig extends Model {
    static associate(models) {
      OutputBig.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      OutputBig.belongsTo(models.Chauffeurs,{as: 'chauffeur', foreignKey:'id_chauffeur'});
      OutputBig.belongsTo(models.Cargo_truck,{as: 'cargo_truck', foreignKey:'id_cargo_truck'});
    }
  }
  OutputBig.init({
    id_output:DataTypes.INTEGER,
    origin: DataTypes.STRING,
    destination: DataTypes.STRING,
    id_chauffeur: DataTypes.INTEGER,
    id_cargo_truck: DataTypes.INTEGER,
    agencia: DataTypes.STRING,
    trans_mariti: DataTypes.STRING,
    number_factura: DataTypes.STRING,
    number_precinto: DataTypes.STRING,
    poliza_seguro: DataTypes.STRING,
    type_container: DataTypes.STRING,
    number_contenedor: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'OutputBig',
    tableName: 'output_big'
  });
  return OutputBig;
};
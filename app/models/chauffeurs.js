'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Chauffeurs extends Model {
    static associate(models) {
      Chauffeurs.belongsTo(models.Trasport_company,{as: 'trasport_company', foreignKey:'id_trasport_company'});
      Chauffeurs.hasOne(models.OutputBig,{as: 'outputBig', foreignKey:'id_chauffeur'});
    }
  }
  Chauffeurs.init({
    full_names: DataTypes.STRING,
    number_document: DataTypes.STRING,
    id_trasport_company: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Chauffeurs',
    tableName: 'chauffeurs'
  });
  return Chauffeurs;
};
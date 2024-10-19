'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Provider extends Model {
    static associate(models) {
      Provider.belongsTo(models.Category,{as: 'category', foreignKey:'id_category'});
      Provider.belongsTo(models.TypesProvider,{as: 'type', foreignKey:'id_type_provider'});
      Provider.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Provider.belongsTo(models.Sector,{as: 'sector', foreignKey:'id_sector'});
      Provider.hasMany(models.Kardex,{as: 'kardex', foreignKey:'id_provider'});
      Provider.hasMany(models.Input,{as: 'input', foreignKey:'id_provider'});
      Provider.hasMany(models.AccountsPayable,{as: 'accounts_payable', foreignKey:'id_provider'});
    }
  }
  Provider.init({
    full_names: DataTypes.STRING,
    id_sector: DataTypes.INTEGER,
    number_document: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    direction: DataTypes.STRING,
    mayorista: DataTypes.BOOLEAN,
    name_contact: DataTypes.STRING,
    companyContacts: DataTypes.STRING,
    workAreaOrPositionOrUnit: DataTypes.STRING,
    frequency: DataTypes.STRING,
    cellphone_contact: DataTypes.INTEGER,
    id_category: DataTypes.INTEGER,
    id_type_provider: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Provider',
    tableName: 'providers'
  });
  return Provider;
};
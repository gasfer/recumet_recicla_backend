'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ViewProviderTotals extends Model {
    static associate(models) {
        ViewProviderTotals.belongsTo(models.Category,{as: 'category', foreignKey:'id_category'});
        ViewProviderTotals.belongsTo(models.TypesProvider,{as: 'type', foreignKey:'id_type_provider'});
        ViewProviderTotals.belongsTo(models.Sector,{as: 'sector', foreignKey:'id_sector'});
    }
  }
  ViewProviderTotals.init({
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
    status: DataTypes.BOOLEAN,
    date_last_input: DataTypes.DATE,
    total_inputs: DataTypes.DECIMAL,
    total_products: DataTypes.DECIMAL,
    saldo_cuentas_por_pagar: DataTypes.DECIMAL
  }, {
    sequelize,
    modelName: 'ViewProviderTotals',
    tableName: 'view_providers_totals'
  });
  return ViewProviderTotals;
};
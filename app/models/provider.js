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
      Provider.belongsTo(models.User, { as: 'commercialUser', foreignKey: 'id_commercial_user' });
      Provider.belongsTo(models.ProviderCompany, { as: 'company', foreignKey: 'id_provider_company' });
      Provider.hasMany(models.Input,{as: 'input', foreignKey:'id_provider'});
      Provider.hasMany(models.AccountsPayable,{as: 'accounts_payable', foreignKey:'id_provider'});
      Provider.hasMany(models.ProviderBranch, { as: 'branches', foreignKey: 'id_provider' });
      Provider.hasMany(models.ProviderContact, { as: 'contacts', foreignKey: 'id_provider' });
      Provider.hasMany(models.ProviderBankAccount, { as: 'bankAccounts', foreignKey: 'id_provider' });
      Provider.hasMany(models.ProviderMaterial, { as: 'materials', foreignKey: 'id_provider' });
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
    id_provider_company: DataTypes.INTEGER,
    site_role: DataTypes.ENUM('HEADQUARTERS', 'BRANCH'),
    status: DataTypes.BOOLEAN,
    estado_registro: DataTypes.ENUM('PENDIENTE', 'VALIDADO'),
    commercial_name: DataTypes.STRING,
    entity_type: DataTypes.STRING,
    id_commercial_user: DataTypes.INTEGER,
    origin_channel: DataTypes.STRING,
    relationship_status: DataTypes.STRING,
    negotiation_condition: DataTypes.TEXT,
    commercial_observations: DataTypes.TEXT,
    requires_certificate: DataTypes.BOOLEAN,
    requires_traceability_report: DataTypes.BOOLEAN,
    service_mode: DataTypes.STRING,
    general_observations: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Provider',
    tableName: 'providers'
  });
  return Provider;
};

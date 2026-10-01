'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ProviderCompany extends Model {
    static associate(models) {
      ProviderCompany.hasMany(models.Provider, { as: 'operatingProviders', foreignKey: 'id_provider_company' });
      ProviderCompany.hasMany(models.ProviderCompanyDocument, { as: 'documents', foreignKey: 'id_provider_company' });
      ProviderCompany.belongsTo(models.User, { as: 'commercialUser', foreignKey: 'id_commercial_user' });
    }
  }
  ProviderCompany.init({
    full_names: DataTypes.STRING, number_document: DataTypes.STRING, commercial_name: DataTypes.STRING,
    corporate_phone: DataTypes.STRING, corporate_cellphone: DataTypes.STRING,
    corporate_email: DataTypes.STRING, website: DataTypes.STRING,
    entity_type: DataTypes.STRING, id_type_provider: DataTypes.INTEGER, origin_channel: DataTypes.STRING,
    relationship_status: DataTypes.STRING, negotiation_condition: DataTypes.TEXT,
    commercial_observations: DataTypes.TEXT, requires_certificate: DataTypes.BOOLEAN,
    requires_traceability_report: DataTypes.BOOLEAN, general_observations: DataTypes.TEXT,
    id_commercial_user: DataTypes.INTEGER,
    operational_type: DataTypes.STRING,
    has_branches: DataTypes.BOOLEAN, status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderCompany', tableName: 'provider_companies' });
  return ProviderCompany;
};

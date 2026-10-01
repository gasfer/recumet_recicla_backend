'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderCompanyDocument extends Model {
    static associate(models) { ProviderCompanyDocument.belongsTo(models.ProviderCompany, { as: 'company', foreignKey: 'id_provider_company' }); }
  }
  ProviderCompanyDocument.init({
    id_provider_company: DataTypes.INTEGER, document_type: DataTypes.STRING, original_name: DataTypes.STRING,
    stored_name: DataTypes.STRING, mime_type: DataTypes.STRING, size_bytes: DataTypes.INTEGER, status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderCompanyDocument', tableName: 'provider_company_documents' });
  return ProviderCompanyDocument;
};

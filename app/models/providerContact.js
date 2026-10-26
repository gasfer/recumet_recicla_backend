'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderContact extends Model {
    static associate(models) {
      ProviderContact.belongsTo(models.Provider, { as: 'provider', foreignKey: 'id_provider' });
    }
  }

  ProviderContact.init({
    id_provider: DataTypes.INTEGER,
    full_name: DataTypes.STRING,
    position_area: DataTypes.STRING,
    cellphone: DataTypes.STRING,
    email: DataTypes.STRING,
    department: DataTypes.STRING,
    comments: DataTypes.STRING(500),
    is_main_contact: DataTypes.BOOLEAN,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderContact', tableName: 'provider_contacts' });

  return ProviderContact;
};

'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderBranch extends Model {
    static associate(models) {
      ProviderBranch.belongsTo(models.Provider, { as: 'provider', foreignKey: 'id_provider' });
    }
  }

  ProviderBranch.init({
    id_provider: DataTypes.INTEGER,
    branch_name: DataTypes.STRING,
    department: DataTypes.STRING,
    city: DataTypes.STRING,
    zone: DataTypes.STRING,
    address: DataTypes.STRING,
    latitude: DataTypes.DECIMAL(10, 7),
    longitude: DataTypes.DECIMAL(10, 7),
    geolocation_text: DataTypes.STRING(500),
    google_maps_url: DataTypes.STRING(1000),
    is_main: DataTypes.BOOLEAN,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderBranch', tableName: 'provider_branches' });

  return ProviderBranch;
};

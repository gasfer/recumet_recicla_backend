'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderMaterial extends Model {
    static associate(models) {
      ProviderMaterial.belongsTo(models.Provider, { as: 'provider', foreignKey: 'id_provider' });
      ProviderMaterial.belongsTo(models.Category, { as: 'category', foreignKey: 'id_category' });
      ProviderMaterial.belongsTo(models.Product, { as: 'product', foreignKey: 'id_product' });
    }
  }

  ProviderMaterial.init({
    id_provider: DataTypes.INTEGER,
    id_category: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    frequency: DataTypes.STRING,
    frequency_mode: {
      type: DataTypes.STRING,
      defaultValue: 'automatic'
    },
    average_days: DataTypes.DECIMAL,
    total_deliveries: DataTypes.INTEGER,
    last_delivery_date: DataTypes.DATE,
    next_estimated_date: DataTypes.DATE,
    service_mode: DataTypes.STRING,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderMaterial', tableName: 'provider_materials' });

  return ProviderMaterial;
};

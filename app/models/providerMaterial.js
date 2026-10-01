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
    service_mode: DataTypes.STRING,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderMaterial', tableName: 'provider_materials' });

  return ProviderMaterial;
};

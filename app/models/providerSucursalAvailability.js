'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProviderSucursalAvailability extends Model {
    static associate(models) {
      ProviderSucursalAvailability.belongsTo(models.Provider, { as: 'provider', foreignKey: 'id_provider' });
      ProviderSucursalAvailability.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
    }
  }

  ProviderSucursalAvailability.init({
    id_provider: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
  }, { sequelize, modelName: 'ProviderSucursalAvailability', tableName: 'provider_sucursal_availability' });

  return ProviderSucursalAvailability;
};

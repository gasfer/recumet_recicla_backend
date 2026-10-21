'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TruckWeighing extends Model {}

  TruckWeighing.init({
    ticket: { type: DataTypes.STRING, allowNull: false, unique: true },
    registered_at: { type: DataTypes.DATE, allowNull: false },
    first_weight: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    second_weight: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    tare: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    gross: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    net: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    ing_sal: { type: DataTypes.STRING(16), allowNull: true },
    first_time: { type: DataTypes.STRING(16), allowNull: false },
    second_time: { type: DataTypes.STRING(16), allowNull: true },
    state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PRIMER_PESO' },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    sequelize,
    modelName: 'TruckWeighing',
    tableName: 'truck_weighings',
  });

  return TruckWeighing;
};

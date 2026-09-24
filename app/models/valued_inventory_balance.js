'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ValuedInventoryBalance extends Model {}
  ValuedInventoryBalance.init({
    id_product: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    quantity: DataTypes.DECIMAL(20, 4),
    average_unit_cost: DataTypes.DECIMAL(20, 4),
    balance_value: DataTypes.DECIMAL(20, 4),
    valuation_status: DataTypes.STRING,
    valuation_reason: DataTypes.TEXT,
    last_entry_id: DataTypes.BIGINT,
  }, { sequelize, modelName: 'ValuedInventoryBalance', tableName: 'valued_inventory_balances' });
  return ValuedInventoryBalance;
};

'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ValuedKardexEntry extends Model {}
  ValuedKardexEntry.init({
    movement_date: DataTypes.DATE,
    source_sequence: DataTypes.INTEGER,
    source_type: DataTypes.STRING,
    source_id: DataTypes.STRING,
    source_detail_id: DataTypes.STRING,
    effect_type: DataTypes.STRING,
    id_product: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    id_user: DataTypes.INTEGER,
    quantity_input: DataTypes.DECIMAL(20, 4),
    quantity_output: DataTypes.DECIMAL(20, 4),
    applied_unit_cost: DataTypes.DECIMAL(20, 4),
    input_value: DataTypes.DECIMAL(20, 4),
    output_value: DataTypes.DECIMAL(20, 4),
    quantity_after: DataTypes.DECIMAL(20, 4),
    average_unit_cost_after: DataTypes.DECIMAL(20, 4),
    balance_value_after: DataTypes.DECIMAL(20, 4),
    valuation_status: DataTypes.STRING,
    valuation_reason: DataTypes.TEXT,
    original_entry_id: DataTypes.BIGINT,
  }, { sequelize, modelName: 'ValuedKardexEntry', tableName: 'valued_kardex_entries' });
  return ValuedKardexEntry;
};

'use strict';

const { DataTypes } = require('sequelize');

const BALANCE_LOCATION_INDEX = 'valued_inventory_balances_location_unique';
const ENTRY_LOCATION_SEQUENCE_INDEX = 'valued_kardex_entries_location_sequence';
const ENTRY_SOURCE_EFFECT_INDEX = 'valued_kardex_entries_source_effect_unique';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('valued_inventory_balances', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: DataTypes.INTEGER },
        id_product: { allowNull: false, type: DataTypes.INTEGER },
        id_sucursal: { allowNull: false, type: DataTypes.INTEGER },
        id_storage: { allowNull: false, type: DataTypes.INTEGER },
        quantity: { allowNull: false, type: DataTypes.DECIMAL(20, 4), defaultValue: 0 },
        average_unit_cost: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        balance_value: { allowNull: false, type: DataTypes.DECIMAL(20, 4), defaultValue: 0 },
        valuation_status: { allowNull: false, type: DataTypes.STRING(20), defaultValue: 'UNVALUED' },
        valuation_reason: { allowNull: true, type: DataTypes.TEXT },
        last_entry_id: { allowNull: true, type: DataTypes.BIGINT },
        createdAt: { allowNull: false, type: DataTypes.DATE },
        updatedAt: { allowNull: false, type: DataTypes.DATE },
      }, { transaction });
      await queryInterface.addConstraint('valued_inventory_balances', {
        fields: ['valuation_status'], type: 'check',
        where: { valuation_status: ['VALUED', 'UNVALUED'] },
        name: 'valued_inventory_balances_status_check', transaction,
      });
      await queryInterface.addIndex('valued_inventory_balances', ['id_product', 'id_sucursal', 'id_storage'], {
        name: BALANCE_LOCATION_INDEX, unique: true, transaction,
      });

      await queryInterface.createTable('valued_kardex_entries', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: DataTypes.BIGINT },
        movement_date: { allowNull: false, type: DataTypes.DATE },
        source_sequence: { allowNull: false, type: DataTypes.INTEGER },
        source_type: { allowNull: false, type: DataTypes.STRING(40) },
        source_id: { allowNull: false, type: DataTypes.STRING(80) },
        source_detail_id: { allowNull: true, type: DataTypes.STRING(80) },
        effect_type: { allowNull: false, type: DataTypes.STRING(40) },
        id_product: { allowNull: false, type: DataTypes.INTEGER },
        id_sucursal: { allowNull: false, type: DataTypes.INTEGER },
        id_storage: { allowNull: false, type: DataTypes.INTEGER },
        id_user: { allowNull: true, type: DataTypes.INTEGER },
        quantity_input: { allowNull: false, type: DataTypes.DECIMAL(20, 4), defaultValue: 0 },
        quantity_output: { allowNull: false, type: DataTypes.DECIMAL(20, 4), defaultValue: 0 },
        applied_unit_cost: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        input_value: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        output_value: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        quantity_after: { allowNull: false, type: DataTypes.DECIMAL(20, 4) },
        average_unit_cost_after: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        balance_value_after: { allowNull: true, type: DataTypes.DECIMAL(20, 4) },
        valuation_status: { allowNull: false, type: DataTypes.STRING(20) },
        valuation_reason: { allowNull: true, type: DataTypes.TEXT },
        original_entry_id: { allowNull: true, type: DataTypes.BIGINT },
        createdAt: { allowNull: false, type: DataTypes.DATE },
        updatedAt: { allowNull: false, type: DataTypes.DATE },
      }, { transaction });
      await queryInterface.addConstraint('valued_kardex_entries', {
        fields: ['valuation_status'], type: 'check',
        where: { valuation_status: ['VALUED', 'UNVALUED'] },
        name: 'valued_kardex_entries_status_check', transaction,
      });
      await queryInterface.addIndex('valued_kardex_entries', ['id_product', 'id_sucursal', 'id_storage', 'movement_date', 'source_sequence', 'id'], {
        name: ENTRY_LOCATION_SEQUENCE_INDEX, transaction,
      });
      await queryInterface.addIndex('valued_kardex_entries', ['source_type', 'source_id', 'source_detail_id', 'effect_type'], {
        name: ENTRY_SOURCE_EFFECT_INDEX, unique: true, transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('valued_kardex_entries', { transaction });
      await queryInterface.dropTable('valued_inventory_balances', { transaction });
    });
  },

  BALANCE_LOCATION_INDEX,
  ENTRY_LOCATION_SEQUENCE_INDEX,
  ENTRY_SOURCE_EFFECT_INDEX,
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('stock_reconciliation_actions', 'registry_number', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('stock_reconciliation_actions', 'count_description', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn('stock_reconciliation_actions', 'id_count_responsible_user', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('stock_reconciliation_actions', ['registry_number'], {
      name: 'stock_reconciliation_action_registry_number_unique', unique: true,
      where: { registry_number: { [Sequelize.Op.ne]: null } },
    });
    await queryInterface.addIndex('stock_reconciliation_actions', ['id_stock_reconciliation_case'], {
      name: 'stock_reconciliation_action_akfp_case_unique', unique: true,
      where: { registry_number: { [Sequelize.Op.like]: 'AKFP-%' } },
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('stock_reconciliation_actions', 'stock_reconciliation_action_akfp_case_unique');
    await queryInterface.removeIndex('stock_reconciliation_actions', 'stock_reconciliation_action_registry_number_unique');
    await queryInterface.removeColumn('stock_reconciliation_actions', 'id_count_responsible_user');
    await queryInterface.removeColumn('stock_reconciliation_actions', 'count_description');
    await queryInterface.removeColumn('stock_reconciliation_actions', 'registry_number');
  },
};

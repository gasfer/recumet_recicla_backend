'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transfer_historical_difference_completions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      idempotency_key: { allowNull: false, type: Sequelize.STRING, unique: true },
      completion_type: { allowNull: false, type: Sequelize.STRING },
      quantity: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      allocations: { allowNull: false, type: Sequelize.JSONB, defaultValue: [] },
      projection_fingerprint: { allowNull: false, type: Sequelize.STRING },
      reason: { allowNull: false, type: Sequelize.TEXT },
      status: { allowNull: false, type: Sequelize.STRING, defaultValue: 'ACTIVE' },
      id_transfer: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_detail_transfer: { type: Sequelize.INTEGER, references: { model: 'details_transfers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      id_transfer_review_note: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_notes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_kardex_movement: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'kardex_movements', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_product: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('transfer_historical_difference_completions', ['id_transfer', 'completion_type', 'status'], {
      name: 'transfer_historical_completion_transfer_type_idx',
    });
    await queryInterface.addIndex('transfer_historical_difference_completions', ['id_detail_transfer', 'status'], {
      name: 'transfer_historical_completion_detail_idx',
    });
    await queryInterface.addConstraint('transfer_historical_difference_completions', {
      fields: ['id_kardex_movement'],
      type: 'unique',
      name: 'transfer_historical_completion_movement_uq',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transfer_historical_difference_completions');
  },
};


'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transfer_review_notes', 'management_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'ACTIVA',
    });
    await queryInterface.addColumn('transfer_review_notes', 'management_reason', { type: Sequelize.TEXT });
    await queryInterface.addColumn('transfer_review_notes', 'reverted_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_notes', 'id_reverted_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn('transfer_review_notes', 'deleted_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_notes', 'id_deleted_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn('transfer_review_resolution_actions', 'management_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'ACTIVA',
    });
    await queryInterface.addIndex('transfer_review_notes', ['management_status', 'date'], {
      name: 'transfer_review_notes_management_status_date_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('transfer_review_notes', 'transfer_review_notes_management_status_date_idx');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'management_status');
    await queryInterface.removeColumn('transfer_review_notes', 'id_deleted_user');
    await queryInterface.removeColumn('transfer_review_notes', 'deleted_at');
    await queryInterface.removeColumn('transfer_review_notes', 'id_reverted_user');
    await queryInterface.removeColumn('transfer_review_notes', 'reverted_at');
    await queryInterface.removeColumn('transfer_review_notes', 'management_reason');
    await queryInterface.removeColumn('transfer_review_notes', 'management_status');
  },
};

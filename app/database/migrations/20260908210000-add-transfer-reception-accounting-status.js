'use strict';

const ACCOUNTED = 'CONTABILIZADO';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('details_transfers', 'accounting_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: ACCOUNTED,
    });
    await queryInterface.addColumn('details_transfers', 'tolerance_decision', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('details_transfers', 'receipt_difference_percentage', {
      type: Sequelize.DECIMAL,
      allowNull: true,
    });
    await queryInterface.addColumn('details_transfers', 'accounting_applied_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.changeColumn('transfer_review_notes', 'id_kardex_movement', {
      type: Sequelize.INTEGER,
      allowNull: true,
      unique: true,
      references: { model: 'kardex_movements', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.sequelize.query(`
      UPDATE details_transfers
      SET accounting_status = '${ACCOUNTED}'
      WHERE accounting_status IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.changeColumn('transfer_review_notes', 'id_kardex_movement', {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'kardex_movements', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.removeColumn('details_transfers', 'accounting_applied_at');
    await queryInterface.removeColumn('details_transfers', 'receipt_difference_percentage');
    await queryInterface.removeColumn('details_transfers', 'tolerance_decision');
    await queryInterface.removeColumn('details_transfers', 'accounting_status');
  },
};

'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('abonos_accounts_payables', 'number_transaction', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('abonos_accounts_payables', 'payment_voucher', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('abonos_accounts_payables_multiple', 'number_transaction', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('abonos_accounts_payables_multiple', 'payment_voucher', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('abonos_accounts_payables', 'number_transaction');
    await queryInterface.removeColumn('abonos_accounts_payables', 'payment_voucher');
    await queryInterface.removeColumn('abonos_accounts_payables_multiple', 'number_transaction');
    await queryInterface.removeColumn('abonos_accounts_payables_multiple', 'payment_voucher');
  }
};

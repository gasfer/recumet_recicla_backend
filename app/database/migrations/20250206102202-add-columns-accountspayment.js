'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('abonos_accounts_payables', 'comments', {
      type: Sequelize.TEXT,
    });
    await queryInterface.addColumn('abonos_accounts_payables', 'type_payment', {
      type: Sequelize.STRING,
      defaultValue:'EFECTIVO'
    });
    await queryInterface.addColumn('abonos_accounts_payables', 'account_output', {
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('abonos_accounts_payables', 'id_bank', {
      type: Sequelize.INTEGER,
      references: {
        model: 'banks',
        key: 'id'
      }
    });

    // await queryInterface.addColumn('abonos_accounts_payables', 'from_pay_multiple', {
    //   type: Sequelize.BOOLEAN,
    //   default: false,
    // });
    // await queryInterface.addColumn('abonos_accounts_receivable', 'from_pay_multiple', {
    //   type: Sequelize.BOOLEAN,
    //   default: false,
    // });


    await queryInterface.addColumn('abonos_accounts_receivable', 'comments', {
      type: Sequelize.TEXT,
    });
    await queryInterface.addColumn('abonos_accounts_receivable', 'type_payment', {
      type: Sequelize.STRING,
      defaultValue:'EFECTIVO'
    });
    await queryInterface.addColumn('abonos_accounts_receivable', 'account_input', {
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('abonos_accounts_receivable', 'id_bank', {
      type: Sequelize.INTEGER,
      references: {
        model: 'banks',
        key: 'id'
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('abonos_accounts_payables', 'comments');
    await queryInterface.removeColumn('abonos_accounts_payables', 'type_payment');
    await queryInterface.removeColumn('abonos_accounts_payables', 'account_output');
    await queryInterface.removeColumn('abonos_accounts_payables', 'id_bank');
    // await queryInterface.removeColumn('abonos_accounts_payables', 'from_pay_multiple');
    // await queryInterface.removeColumn('abonos_accounts_receivable', 'from_pay_multiple');
    await queryInterface.removeColumn('abonos_accounts_receivable', 'comments');
    await queryInterface.removeColumn('abonos_accounts_receivable', 'type_payment');
    await queryInterface.removeColumn('abonos_accounts_receivable', 'account_input');
    await queryInterface.removeColumn('abonos_accounts_receivable', 'id_bank');
  }
};
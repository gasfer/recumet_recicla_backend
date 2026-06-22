'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('inputs', 'referral_sources', {
      type: Sequelize.STRING,
    }); 
    await queryInterface.addColumn('inputs', 'old_customer', {
      type: Sequelize.BOOLEAN,
    }); 
    await queryInterface.addColumn('inputs', 'with_pickup', {
      type: Sequelize.BOOLEAN,
    }); 

    // Add colums to abonos_accounts_payables table
    await queryInterface.addColumn('abonos_accounts_payables', 'account_origin', {
      type: Sequelize.STRING,
    }); 
    await queryInterface.addColumn('abonos_accounts_payables', 'id_bank_origin', {
      type: Sequelize.INTEGER,
      references: {
        model: 'banks',
        key: 'id'
      }
    });

    // Add colums to abonos_accounts_payables_multiple table
    await queryInterface.addColumn('abonos_accounts_payables_multiple', 'account_origin', {
      type: Sequelize.STRING,
    }); 
    await queryInterface.addColumn('abonos_accounts_payables_multiple', 'id_bank_origin', {
      type: Sequelize.INTEGER,
      references: {
        model: 'banks',
        key: 'id'
      }
    });

  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('inputs', 'referral_sources');
    await queryInterface.removeColumn('inputs', 'old_customer');
    await queryInterface.removeColumn('inputs', 'with_pickup');
    await queryInterface.removeColumn('abonos_accounts_payables', 'account_origin');
    await queryInterface.removeColumn('abonos_accounts_payables', 'id_bank_origin');
    await queryInterface.removeColumn('abonos_accounts_payables_multiple', 'account_origin');
    await queryInterface.removeColumn('abonos_accounts_payables_multiple', 'id_bank_origin');
  }
};
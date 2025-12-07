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
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('inputs', 'referral_sources');
    await queryInterface.removeColumn('inputs', 'old_customer');
    await queryInterface.removeColumn('inputs', 'with_pickup');
  }
};
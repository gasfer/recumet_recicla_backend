'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('inputs', 'number_transaction', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('inputs', 'number_transaction');
  }
};

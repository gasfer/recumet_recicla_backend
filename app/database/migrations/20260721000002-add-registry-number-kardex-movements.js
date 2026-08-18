'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('kardex_movements');
    if (!table.registry_number) {
      await queryInterface.addColumn('kardex_movements', 'registry_number', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('kardex_movements');
    if (table.registry_number) {
      await queryInterface.removeColumn('kardex_movements', 'registry_number');
    }
  }
};

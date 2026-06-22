'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('details_transfers', 'quantity_received', {
      type: Sequelize.DECIMAL,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('details_transfers', 'quantity_received');
  }
};

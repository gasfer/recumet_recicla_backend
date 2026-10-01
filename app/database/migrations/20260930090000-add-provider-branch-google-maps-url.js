'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_branches', 'google_maps_url', { type: Sequelize.STRING(1000), allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('provider_branches', 'google_maps_url');
  },
};

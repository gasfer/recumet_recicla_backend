'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_branches', 'province', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('provider_branches', 'latitude', { type: Sequelize.DECIMAL(10, 7), allowNull: true });
    await queryInterface.addColumn('provider_branches', 'longitude', { type: Sequelize.DECIMAL(10, 7), allowNull: true });
    await queryInterface.addColumn('provider_branches', 'geolocation_text', { type: Sequelize.STRING(500), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('provider_branches', 'geolocation_text');
    await queryInterface.removeColumn('provider_branches', 'longitude');
    await queryInterface.removeColumn('provider_branches', 'latitude');
    await queryInterface.removeColumn('provider_branches', 'province');
  },
};

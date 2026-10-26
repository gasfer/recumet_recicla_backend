'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_companies', 'contact_priority', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'MEDIUM',
    });
    await queryInterface.addColumn('provider_companies', 'contact_observations', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('provider_companies', 'contact_observations');
    await queryInterface.removeColumn('provider_companies', 'contact_priority');
  },
};

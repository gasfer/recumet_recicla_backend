'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('provider_branches', 'province');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_branches', 'province', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
};

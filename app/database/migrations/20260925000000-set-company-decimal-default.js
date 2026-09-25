'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('companies', 'decimals', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 4,
    });
    await queryInterface.sequelize.query('UPDATE companies SET decimals = 4 WHERE id = 1');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('UPDATE companies SET decimals = 2 WHERE id = 1');
    await queryInterface.changeColumn('companies', 'decimals', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  },
};

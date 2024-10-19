'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('providers', 'companyContacts', {
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('providers', 'workAreaOrPositionOrUnit', {
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('providers', 'frequency', {
      type: Sequelize.STRING,
    });
    await queryInterface.removeColumn('providers', 'type');
    await queryInterface.addColumn('providers', 'id_type_provider', {
      type: Sequelize.INTEGER,
      references: {
        model: 'types_provider',
        key: 'id'
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('providers', 'companyContacts');
    await queryInterface.removeColumn('providers', 'workAreaOrPositionOrUnit');
    await queryInterface.removeColumn('providers', 'frequency');
  }
};
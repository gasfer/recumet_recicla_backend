'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transfers', 'type_registry', {
      type: Sequelize.STRING,
    });
    await queryInterface.addColumn('transfers', 'registry_number', {
      type: Sequelize.STRING
    });
    await queryInterface.addColumn('transfers', 'id_scales', {
      type: Sequelize.INTEGER,
      references: {
        model: 'scales',
        key: 'id'
      },
    });
 
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('transfers', 'type_registry');
    await queryInterface.removeColumn('transfers', 'registry_number');
    await queryInterface.removeColumn('transfers', 'id_scales');
  }
};
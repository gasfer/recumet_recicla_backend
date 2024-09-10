'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('companies', 'cellphone', {
      type: Sequelize.STRING,
      allowNull: true, // Ajusta esto según tus necesidades
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('companies', 'cellphone', {
      type: Sequelize.INTEGER,
      allowNull: true, // Ajusta esto según tus necesidades
    });
  }
};
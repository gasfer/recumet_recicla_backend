'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('companies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING
      },
      nit: {
        type: Sequelize.STRING
      },
      razon_social: {
        type: Sequelize.STRING
      },
      activity: {
        type: Sequelize.TEXT
      },
      email: {
        type: Sequelize.STRING
      },
      cellphone: {
        type: Sequelize.INTEGER
      },
      logo: {
        type: Sequelize.STRING
      },
      address: {
        type: Sequelize.STRING
      },
      decimals: {
        type: Sequelize.INTEGER
      },
      status: {
        type: Sequelize.BOOLEAN
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('companies');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('assign_shifts', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_user: {
        references: {
          model: 'users',
          key: 'id'
        },
        type: Sequelize.INTEGER
      },
      number_day: {
        type: Sequelize.INTEGER
      },
      day: {
        type: Sequelize.STRING
      },
      hour_start: {
        type: Sequelize.STRING
      },
      hour_end: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('assign_shifts');
  }
};
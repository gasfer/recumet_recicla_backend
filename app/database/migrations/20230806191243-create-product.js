'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      name: {
        type: Sequelize.STRING
      },
      description: {
        type: Sequelize.TEXT
      },
      costo: {
        type: Sequelize.DECIMAL
      },
      inventariable: {
        type: Sequelize.BOOLEAN
      },
      img: {
        type: Sequelize.STRING
      },
      id_category: {
        type: Sequelize.INTEGER,
        references: {
          model: 'categories',
          key: 'id'
        },
      },
      id_unit: {
        type: Sequelize.INTEGER,
        references: {
          model: 'units',
          key: 'id'
        },
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
    await queryInterface.dropTable('products');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('providers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      full_names: {
        type: Sequelize.STRING
      },
      id_sector: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sectors',
          key: 'id'
        },
      },
      number_document: {
        type: Sequelize.STRING
      },
      cellphone: {
        type: Sequelize.INTEGER
      },
      direction: {
        type: Sequelize.STRING
      },
      type: {
        type: Sequelize.STRING
      },
      mayorista: {
        type: Sequelize.BOOLEAN
      },
      name_contact: {
        type: Sequelize.STRING
      },
      cellphone_contact: {
        type: Sequelize.INTEGER
      },
      id_category: {
        type: Sequelize.INTEGER,
        references: {
          model: 'categories',
          key: 'id'
        },
      },
      id_sucursal: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
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
    await queryInterface.dropTable('providers');
  }
};
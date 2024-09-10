'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('output_big', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_output: {
        type: Sequelize.INTEGER,
        references: {
          model: 'outputs',
          key: 'id'
        },
      },
      origin: {
        type: Sequelize.STRING
      },
      destination: {
        type: Sequelize.STRING
      },
      id_chauffeur: {
        type: Sequelize.INTEGER,
        references: {
          model: 'chauffeurs',
          key: 'id'
        },
      },
      id_cargo_truck: {
        type: Sequelize.INTEGER,
        references: {
          model: 'cargo_trucks',
          key: 'id'
        },
      },
      agencia: {
        type: Sequelize.STRING
      },
      trans_mariti: {
        type: Sequelize.STRING
      },
      number_factura: {
        type: Sequelize.STRING
      },
      number_precinto: {
        type: Sequelize.STRING
      },
      poliza_seguro: {
        type: Sequelize.STRING
      },
      type_container: {
        type: Sequelize.STRING
      },
      number_contenedor: {
        type: Sequelize.STRING
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
    await queryInterface.dropTable('output_big');
  }
};
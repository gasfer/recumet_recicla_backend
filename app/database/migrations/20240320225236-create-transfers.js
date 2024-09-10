'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transfers', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      date_send: {
        type: Sequelize.DATE
      },
      date_received: {
        type: Sequelize.DATE
      },
      observations_send: {
        type: Sequelize.TEXT
      },
      observations_received: {
        type: Sequelize.TEXT
      },
      total: {
        type: Sequelize.DECIMAL
      },
      id_sucursal_send: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
          key: 'id'
        },
      },
      id_storage_send: {
        type: Sequelize.INTEGER,
        references: {
          model: 'storages',
          key: 'id'
        },
      },
      id_sucursal_received: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
          key: 'id'
        },
      },
      id_storage_received: {
        type: Sequelize.INTEGER,
        references: {
          model: 'storages',
          key: 'id'
        },
      },
      id_user_send: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
      },
      id_user_received: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
          key: 'id'
        },
      },
      status: {
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
    await queryInterface.dropTable('transfers');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('inputs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      date_voucher: {
        type: Sequelize.DATE
      },
      type: {
        type: Sequelize.STRING
      },
      type_payment: {
        type: Sequelize.STRING
      },
      type_registry: {
        type: Sequelize.STRING
      },
      registry_number: {
        type: Sequelize.STRING
      },
      account_input: {
        type: Sequelize.STRING
      },
      comments: {
        type: Sequelize.TEXT
      },
      sumas: {
        type: Sequelize.DECIMAL
      },
      discount: {
        type: Sequelize.DECIMAL
      },
      total: {
        type: Sequelize.DECIMAL
      },
      is_paid: {
        type: Sequelize.STRING
      },
      id_scales: {
        type: Sequelize.INTEGER,
        references: {
          model: 'scales',
          key: 'id'
        },
      },
      id_storage: {
        type: Sequelize.INTEGER,
        references: {
          model: 'storages',
          key: 'id'
        },
      },
      id_provider: {
        type: Sequelize.INTEGER,
        references: {
          model: 'providers',
          key: 'id'
        },
      },
      id_bank: {
        type: Sequelize.INTEGER,
        references: {
          model: 'banks',
          key: 'id'
        },
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
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
    await queryInterface.dropTable('inputs');
  }
};
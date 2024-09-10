'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('accounts_payables', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      id_input: {
        type: Sequelize.INTEGER,
        references: {
          model: 'inputs',
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
      description: {
        type: Sequelize.STRING
      },
      date_credit: {
        type: Sequelize.DATE
      },
      total: {
        type: Sequelize.DECIMAL
      },
      monto_abonado: {
        type: Sequelize.DECIMAL
      },
      monto_restante: {
        type: Sequelize.DECIMAL
      },
      id_sucursal: {
        type: Sequelize.INTEGER,
        references: {
          model: 'sucursals',
          key: 'id'
        },
      },
      status_account: {
        type: Sequelize.STRING,
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
    await queryInterface.dropTable('accounts_payables');
  }
};
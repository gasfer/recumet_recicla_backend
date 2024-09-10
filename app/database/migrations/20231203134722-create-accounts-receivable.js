'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('accounts_receivable', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      id_output: {
        type: Sequelize.INTEGER,
        references: {
          model: 'outputs',
          key: 'id'
        },
      },
      id_client: {
        type: Sequelize.INTEGER,
        references: {
          model: 'clients',
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
    await queryInterface.dropTable('accounts_receivable');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('abonos_accounts_receivable', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      id_account_receivable: {
        type: Sequelize.INTEGER,
        references: {
          model: 'accounts_receivable',
          key: 'id'
        },
      },
      date_abono: {
        type: Sequelize.DATE
      },
      monto_abono: {
        type: Sequelize.DECIMAL
      },
      total_abonado: {
        type: Sequelize.DECIMAL
      },
      restante_credito: {
        type: Sequelize.DECIMAL
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
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
    await queryInterface.dropTable('abonos_accounts_receivable');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('outputs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      voucher: {
        type: Sequelize.STRING
      },
      date_output: {
        type: Sequelize.DATE
      },
      total: {
        type: Sequelize.DECIMAL
      },
      type_voucher: {
        type: Sequelize.STRING
      },
      type_output: {
        type: Sequelize.STRING
      },
      type_payment: {
        type: Sequelize.STRING
      },
      sub_total: {
        type: Sequelize.DECIMAL
      },
      discount: {
        type: Sequelize.STRING
      },
      payment_cash: {
        type: Sequelize.DECIMAL
      },
      payment_linea: {
        type: Sequelize.DECIMAL
      },
      change_money: {
        type: Sequelize.DECIMAL
      },
      account_output: {
        type: Sequelize.STRING
      },
      agreed_date_output: {
        type: Sequelize.DATE
      },
      comments: {
        type: Sequelize.STRING
      },
      type_registry: {
        type: Sequelize.STRING
      },
      number_registry: {
        type: Sequelize.STRING
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
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
      id_client: {
        type: Sequelize.INTEGER,
        references: {
          model: 'clients',
          key: 'id'
        },
      },
      id_scale: {
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
      id_sucursal: {
        type: Sequelize.INTEGER,
        references: {
          model:'sucursals',
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
    await queryInterface.dropTable('outputs');
  }
};
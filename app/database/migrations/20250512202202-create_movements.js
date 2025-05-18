'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kardex_movements', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      date: {
        type: Sequelize.DATE
      },
      type: {
        type: Sequelize.STRING
      },
      details: {
        type: Sequelize.STRING
      },
      quantity: {
        type: Sequelize.DECIMAL
      },
      cost: {
        type: Sequelize.DECIMAL
      },
      price: {
        type: Sequelize.DECIMAL
      },
      total: {
        type: Sequelize.DECIMAL
      },
      id_product: {
        type: Sequelize.INTEGER,
        references: {
          model: 'products',
          key: 'id'
        }
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model: 'users',
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
    await queryInterface.dropTable('kardex_movements');
  }
};
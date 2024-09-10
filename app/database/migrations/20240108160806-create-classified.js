'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('classifieds', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      cod: {
        type: Sequelize.STRING
      },
      date_classified: {
        type: Sequelize.DATE
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
      comments: {
        type: Sequelize.TEXT
      },
      id_product: {
        type: Sequelize.INTEGER,
        references: {
          model: 'products',
          key: 'id'
        }
      },
      cost_product: {
        type: Sequelize.DECIMAL
      },
      quantity_product: {
        type: Sequelize.DECIMAL
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
    await queryInterface.dropTable('classifieds');
  }
};
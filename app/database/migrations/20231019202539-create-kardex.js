'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kardexes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      type: {
        type: Sequelize.STRING
      },
      date: {
        type: Sequelize.DATE
      },
      detalle: {
        type: Sequelize.TEXT
      },
      document: {
        type: Sequelize.STRING
      },
      quantity_inicial: {
        type: Sequelize.DECIMAL
      },
      cost_u_inicial: {
        type: Sequelize.DECIMAL
      },
      cost_total_inicial: {
        type: Sequelize.DECIMAL
      },
      quantity_input: {
        type: Sequelize.DECIMAL
      },
      cost_u_input: {
        type: Sequelize.DECIMAL
      },
      cost_total_input: {
        type: Sequelize.DECIMAL
      },
      quantity_output: {
        type: Sequelize.DECIMAL
      },
      cost_u_output: {
        type: Sequelize.DECIMAL
      },
      cost_total_output: {
        type: Sequelize.DECIMAL
      },

      quantity_saldo: {
        type: Sequelize.DECIMAL
      },
      cost_u_saldo: {
        type: Sequelize.DECIMAL
      },
      cost_total_saldo: {
        type: Sequelize.DECIMAL
      },

      id_product: {
        type: Sequelize.INTEGER,
        references: {
          model: 'products',
          key: 'id'
        },
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
      id_output: {
        type: Sequelize.INTEGER,
        references: {
          model: 'outputs',
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
      id_storage: {
        type: Sequelize.INTEGER,
        references: {
          model: 'storages',
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
    await queryInterface.dropTable('kardexes');
  }
};
'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('caja_smalls', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      date_apertura: {
        type: Sequelize.DATE
      },
      monto_apertura: {
        type: Sequelize.DECIMAL
      },
      monto_cierre: {
        type: Sequelize.DECIMAL
      },
      date_cierre: {
        type: Sequelize.DATE
      },
      id_user: {
        type: Sequelize.INTEGER,
        references: {
          model:'users',
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
    await queryInterface.dropTable('caja_smalls');
  }
};
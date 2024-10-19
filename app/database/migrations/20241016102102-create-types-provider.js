'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('types_provider', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
      },
      code: {
        type: Sequelize.STRING
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

     // Insertar datos una vez que la tabla esté creada
     await queryInterface.bulkInsert('types_provider', [
      {
        name: 'EMPRESAS FORMALES Y COMPAÑÍAS GRANDES',
        code: 'A',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'TALLERES O NEGOCIOS INFORMALES',
        code: 'B',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'ACOPIADORES MAYORISTAS',
        code: 'C',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'ACOPIADORES MINORISTAS',
        code: 'D',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'RRSS DOMICILIARIOS',
        code: 'E',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'ESPORÁDICOS, EMPRESAS PÚBLICAS, LICITACIONES',
        code: 'F',
        status: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('types_provider');
  }
};
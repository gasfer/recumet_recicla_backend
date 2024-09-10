'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    return queryInterface.bulkInsert('sucursals', [{
      name: 'CASA MATRIZ',
      email: 'recumet@gmail.com',
      cellphone: '44544444',
      type: 'PRINCIPAL',
      city: 'COCHABAMBA',
      address: 'Km 5',
      id_company: 1,
      status: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }]);
  },

  async down (queryInterface, Sequelize) {
    return queryInterface.bulkDelete('sucursals', null, {});
  }
};

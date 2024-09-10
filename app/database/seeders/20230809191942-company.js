'use strict';
const path = require('path');
const fs = require('fs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    let companyData =  JSON.parse(fs.readFileSync(path.join(__dirname, '/data/company.json')));
    companyData.forEach(resp => {
      resp.createdAt = new Date(),
      resp.updatedAt = new Date()
    });
    await queryInterface.bulkInsert('companies', companyData);   
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('companies', null, {});
  }
};

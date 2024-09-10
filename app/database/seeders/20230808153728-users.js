'use strict';
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const salt = bcrypt.genSaltSync();

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    let usersData =  JSON.parse(fs.readFileSync(path.join(__dirname, '/data/users.json')));
    let assign_shift =  JSON.parse(fs.readFileSync(path.join(__dirname, '/data/assign_shift.json')));
    usersData.forEach(resp => {
      resp.password = bcrypt.hashSync(resp.password,salt);
      resp.createdAt = new Date(),
      resp.updatedAt = new Date()
    });
    const assign_shifts = [];
    let i = 1;
    usersData.forEach(resp => {
      let assignedShift;
      assign_shift.map(resp => {
        assignedShift = { ...resp,createdAt: new Date(),updatedAt: new Date(), id_user: i };
        assign_shifts.push(assignedShift);
      });
      i++;
    })
    await queryInterface.bulkInsert('users', usersData);
    await queryInterface.bulkInsert('assign_shifts', assign_shifts);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', null, {});
  }
};

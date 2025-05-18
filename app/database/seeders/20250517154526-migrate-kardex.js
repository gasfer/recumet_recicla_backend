'use strict';
const { Op } = require('sequelize');
const { kardexMovements, Kardex} = require('../config');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const Kardexes = await Kardex.findAll({
      where: {
        id_output: null,
        id_input: null,
        id_product_classified: null,
        id_sucursal_origin_destination: null,
        detalle: {
          [Op.notLike]: '%CLASIFICACIÓN%',
          [Op.notILike]: '%ANULACIÓN CLASIFICADO%' // Ver nota abajo
        }
      }
    });
    const kardexesToInsert = Kardexes.map(kardex => {
      return {
        type: kardex.type,
        date: kardex.date,
        details: kardex.detalle,
        quantity: kardex.quantity_input,
        cost: kardex.cost_u_input,
        price: 0,
        total: kardex.cost_total_input,
        id_product: kardex.id_product,
        id_user: null,
        id_sucursal: kardex.id_sucursal,
        id_storage: kardex.id_storage,
        status: true,

        createdAt: kardex.createdAt,
        updatedAt: kardex.updatedAt
      };
    });
    return queryInterface.bulkInsert('kardex_movements', kardexesToInsert);
    //npx sequelize-cli db:seed --seed 20250517154526-migrate-kardex.js
  },

  async down (queryInterface, Sequelize) {
    return queryInterface.bulkDelete('kardex_movements', null, {});
  }
};

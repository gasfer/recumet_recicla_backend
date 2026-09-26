'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [sucursales] = await queryInterface.sequelize.query(`
      SELECT sucursal.id, sucursal.name
      FROM sucursals AS sucursal
      WHERE NOT EXISTS (
        SELECT 1
        FROM storages AS storage
        WHERE storage.id_sucursal = sucursal.id
          AND storage.status = true
      )
    `);

    if (sucursales.length === 0) return;

    const now = new Date();
    await queryInterface.bulkInsert('storages', sucursales.map((sucursal) => ({
      name: `ALMACEN PRINCIPAL ${sucursal.name}`,
      id_sucursal: sucursal.id,
      status: true,
      createdAt: now,
      updatedAt: now,
    })));
  },

  async down() {
    // Los almacenes creados son datos operativos y se conservan al revertir código.
  },
};

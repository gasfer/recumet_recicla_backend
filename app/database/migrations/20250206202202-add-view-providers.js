'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE VIEW view_providers_totals AS
      SELECT
          p.*,
          MAX(i.date_voucher) AS date_last_input,
          COUNT(DISTINCT i.id) AS total_inputs,
          SUM(di.quantity) AS total_products,
          COALESCE(SUM(ap.monto_restante), 0) AS saldo_cuentas_por_pagar
      FROM providers p
      LEFT JOIN inputs i ON i.id_provider = p.id AND i.status = 'ACTIVE'
      LEFT JOIN details_inputs di ON di.id_input = i.id
      LEFT JOIN accounts_payables ap ON ap.id_provider = p.id 
          AND ap.status_account = 'PENDIENTE' 
          AND ap.status = true
      GROUP BY p.id;
    `);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_providers_totals;');
  }
};
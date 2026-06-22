'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_abonos_accounts_payables_all;');
    await queryInterface.sequelize.query(`
      CREATE VIEW view_abonos_accounts_payables_all AS
      SELECT  abonos_accounts_payables.id,
              array[id_account_payable] AS ids_account_payables,
              array[abonos_accounts_payables.id]  as ids_abonos_payables,
              date_abono,
              monto_abono,
              abonos_accounts_payables.id_user,
              abonos_accounts_payables.comments,
              abonos_accounts_payables.type_payment,
              account_output,
              abonos_accounts_payables.id_bank,
              ap.id_provider,
              abonos_accounts_payables."createdAt",
              abonos_accounts_payables."updatedAt",
              array[i.cod] AS codes_input,
              ap.id_sucursal,
              false as from_pay_multiple,
              abonos_accounts_payables.payment_voucher
      FROM abonos_accounts_payables
      JOIN accounts_payables ap on ap.id = abonos_accounts_payables.id_account_payable
      join inputs i on i.id = ap.id_input
      WHERE from_pay_multiple = false AND abonos_accounts_payables.status = true

      UNION

      SELECT id,
             ids_account_payables AS ids_account_payables,
             ids_abonos_payables,
             date_abono,
             monto_abono,
             id_user,
             comments,
             type_payment,
             account_output,
             id_bank,
             id_provider,
             "createdAt",
             "updatedAt",
             codes_input,
             id_sucursal,
             true as from_pay_multiple,
             payment_voucher
      FROM abonos_accounts_payables_multiple
      WHERE abonos_accounts_payables_multiple.status = true;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS view_abonos_accounts_payables_all;');
    await queryInterface.sequelize.query(`
      CREATE VIEW view_abonos_accounts_payables_all AS
      SELECT  abonos_accounts_payables.id,
              array[id_account_payable] AS ids_account_payables,
              array[abonos_accounts_payables.id]  as ids_abonos_payables,
              date_abono,
              monto_abono,
              abonos_accounts_payables.id_user,
              abonos_accounts_payables.comments,
              abonos_accounts_payables.type_payment,
              account_output,
              abonos_accounts_payables.id_bank,
              ap.id_provider,
              abonos_accounts_payables."createdAt",
              abonos_accounts_payables."updatedAt",
              array[i.cod] AS codes_input,
              ap.id_sucursal,
              false as from_pay_multiple
      FROM abonos_accounts_payables
      JOIN accounts_payables ap on ap.id = abonos_accounts_payables.id_account_payable
      join inputs i on i.id = ap.id_input
      WHERE from_pay_multiple = false AND abonos_accounts_payables.status = true

      UNION

      SELECT id,
             ids_account_payables AS ids_account_payables,
             ids_abonos_payables,
             date_abono,
             monto_abono,
             id_user,
             comments,
             type_payment,
             account_output,
             id_bank,
             id_provider,
             "createdAt",
             "updatedAt",
             codes_input,
             id_sucursal,
             true as from_pay_multiple
      FROM abonos_accounts_payables_multiple
      WHERE abonos_accounts_payables_multiple.status = true;
    `);
  }
};

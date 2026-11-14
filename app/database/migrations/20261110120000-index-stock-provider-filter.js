'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS providers_stock_type_id_idx
      ON providers (id_type_provider, id)
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS inputs_stock_provider_scope_idx
      ON inputs (id_provider, id_sucursal, id_storage, id)
      WHERE status = 'ACTIVE'
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS details_inputs_stock_provider_idx
      ON details_inputs (id_input, id_product)
      WHERE status = 'ACTIVE' OR status IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS providers_stock_type_id_idx');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS inputs_stock_provider_scope_idx');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS details_inputs_stock_provider_idx');
  },
};

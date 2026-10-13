'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS details_inputs_report_active_product_input_idx
      ON details_inputs (id_product, id_input)
      WHERE status = 'ACTIVE' AND removed_at IS NULL
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS details_inputs_report_active_input_product_idx
      ON details_inputs (id_input, id_product)
      WHERE status = 'ACTIVE' AND removed_at IS NULL
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS products_report_category_product_idx
      ON products (id_category, id)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX CONCURRENTLY IF EXISTS details_inputs_report_active_product_input_idx');
    await queryInterface.sequelize.query('DROP INDEX CONCURRENTLY IF EXISTS details_inputs_report_active_input_product_idx');
    await queryInterface.sequelize.query('DROP INDEX CONCURRENTLY IF EXISTS products_report_category_product_idx');
  },
};

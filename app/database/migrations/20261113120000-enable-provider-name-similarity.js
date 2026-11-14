'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS providers_full_names_trgm_idx
      ON providers USING gin (
        (UPPER(REGEXP_REPLACE(COALESCE(full_names, ''), '[^[:alnum:]]', '', 'g'))) gin_trgm_ops
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS providers_commercial_name_trgm_idx
      ON providers USING gin (
        (UPPER(REGEXP_REPLACE(COALESCE(commercial_name, ''), '[^[:alnum:]]', '', 'g'))) gin_trgm_ops
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS provider_companies_full_names_trgm_idx
      ON provider_companies USING gin (
        (UPPER(REGEXP_REPLACE(COALESCE(full_names, ''), '[^[:alnum:]]', '', 'g'))) gin_trgm_ops
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS provider_companies_commercial_name_trgm_idx
      ON provider_companies USING gin (
        (UPPER(REGEXP_REPLACE(COALESCE(commercial_name, ''), '[^[:alnum:]]', '', 'g'))) gin_trgm_ops
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS provider_companies_commercial_name_trgm_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS provider_companies_full_names_trgm_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS providers_commercial_name_trgm_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS providers_full_names_trgm_idx;');
  },
};

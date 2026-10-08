'use strict';

// These columns may already exist from the standalone provider migration.
const sql = `
ALTER TABLE providers ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS zone VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS certificate_file_name VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS traceability_file_name VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS frequency_mode VARCHAR(50) DEFAULT 'automatic';
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS frequency_mode VARCHAR(50) DEFAULT 'automatic';
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS average_days NUMERIC(10,2);
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0;
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS last_delivery_date TIMESTAMPTZ;
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS next_estimated_date TIMESTAMPTZ;
ALTER TABLE provider_bank_accounts ADD COLUMN IF NOT EXISTS qr_file_name VARCHAR(255);
ALTER TABLE provider_bank_accounts ADD COLUMN IF NOT EXISTS qr_original_name VARCHAR(255);
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(sql, { transaction });
    });
  },

  async down() {
    // Preserve provider data and columns potentially created by the standalone script.
  },
};

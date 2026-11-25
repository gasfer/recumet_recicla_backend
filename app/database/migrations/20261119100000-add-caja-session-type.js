'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE caja_smalls
        ADD COLUMN IF NOT EXISTS cashbox_type VARCHAR(12) NOT NULL DEFAULT 'CHICA';
      UPDATE caja_smalls SET cashbox_type = 'CHICA' WHERE cashbox_type IS NULL OR cashbox_type = '';
      ALTER TABLE caja_smalls DROP CONSTRAINT IF EXISTS ck_caja_smalls_cashbox_type;
      ALTER TABLE caja_smalls ADD CONSTRAINT ck_caja_smalls_cashbox_type
        CHECK (cashbox_type IN ('CHICA', 'MAYOR'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE caja_smalls DROP CONSTRAINT IF EXISTS ck_caja_smalls_cashbox_type;
      ALTER TABLE caja_smalls DROP COLUMN IF EXISTS cashbox_type;
    `);
  },
};

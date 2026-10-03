'use strict';

// Inventory quantities already use unconstrained NUMERIC. Do not rewrite them
// or change an existing company's policy while deploying this guard.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`ALTER TABLE companies ADD CONSTRAINT companies_decimal_policy_range CHECK (decimals IS NOT NULL AND decimals BETWEEN 0 AND 4) NOT VALID`, { transaction });
      await queryInterface.sequelize.query('ALTER TABLE companies VALIDATE CONSTRAINT companies_decimal_policy_range', { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE companies DROP CONSTRAINT companies_decimal_policy_range');
  },
};

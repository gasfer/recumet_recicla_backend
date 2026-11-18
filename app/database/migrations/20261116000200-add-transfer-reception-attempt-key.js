'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('transfers');
    if (!columns.reception_attempt_key) {
      await queryInterface.addColumn('transfers', 'reception_attempt_key', {
        type: Sequelize.STRING(80), allowNull: true,
      });
    }
    await queryInterface.sequelize.query(`
      UPDATE transfers
      SET reception_attempt_key = 'legacy-' || id::text
      WHERE status = 'RECEIVED' AND reception_attempt_key IS NULL
    `);
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('transfers');
    if (columns.reception_attempt_key) await queryInterface.removeColumn('transfers', 'reception_attempt_key');
  },
};

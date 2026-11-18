'use strict';

module.exports = {
  async up(queryInterface) {
    // Intencionalmente no crear eventos MIGRADA al instalar el flujo nuevo.
    // La limpieza de datos existentes se realiza con stock-kardex-baseline-reset-apply.sql.
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM transfer_review_events
      WHERE event_type = 'MIGRADA'
        AND metadata->>'source' = 'baseline-migration'
    `);
  },
};

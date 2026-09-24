'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS kardex_movements_daily_history_idx ON kardex_movements (id_sucursal, id_storage, date DESC) WHERE status = true;");
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS inputs_daily_history_idx ON inputs (id_sucursal, id_storage, date_voucher DESC) WHERE status = 'ACTIVE';");
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS outputs_daily_history_idx ON outputs (id_sucursal, id_storage, date_output DESC) WHERE status = 'ACTIVE';");
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS transfers_send_daily_history_idx ON transfers (id_sucursal_send, id_storage_send, date_send DESC) WHERE status IN ('PENDING', 'RECEIVED');");
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS transfers_received_daily_history_idx ON transfers (id_sucursal_received, id_storage_received, date_received DESC) WHERE status = 'RECEIVED';");
    await queryInterface.sequelize.query("CREATE INDEX IF NOT EXISTS classifieds_daily_history_idx ON classifieds (id_sucursal, id_storage, date_classified DESC) WHERE status = 'ACTIVE';");
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS kardex_movements_daily_history_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS inputs_daily_history_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS outputs_daily_history_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS transfers_send_daily_history_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS transfers_received_daily_history_idx;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS classifieds_daily_history_idx;');
  },
};

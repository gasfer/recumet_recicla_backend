'use strict';

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query("SET LOCAL lock_timeout = '8s'", { transaction });
      await queryInterface.sequelize.query("SET LOCAL statement_timeout = '180s'", { transaction });
      const table = await queryInterface.describeTable('purchase_audit_events', { transaction });
      if (table.id_provider) {
        await queryInterface.removeColumn('purchase_audit_events', 'id_provider', { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      const databaseError = error.original || error.parent || error;
      if (databaseError.code === '55P03' || /lock timeout/i.test(databaseError.message || '')) {
        throw new Error(
          'No se pudo retirar la trazabilidad por proveedor porque la tabla esta bloqueada. ' +
          'Detenga las instancias del backend y vuelva a ejecutar la migracion.',
          { cause: error },
        );
      }
      throw error;
    }
  },

  // The removed provider value was redundant and remains available through
  // purchase_audit_events.id_input -> inputs.id_provider.
  async down() {},
};

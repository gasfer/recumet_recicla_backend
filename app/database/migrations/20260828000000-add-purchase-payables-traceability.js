'use strict';

const addColumnsIfMissing = async (queryInterface, tableName, columns, transaction) => {
  // Keep catalog inspection on the transaction connection. Opening a second
  // connection here can deadlock the migration when the pool has one free slot.
  const table = await queryInterface.describeTable(tableName, { transaction });
  for (const [columnName, definition] of Object.entries(columns)) {
    if (!table[columnName]) {
      await queryInterface.addColumn(tableName, columnName, definition, { transaction });
    }
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Do not wait indefinitely when the application or another migration keeps
      // one of these tables locked. PostgreSQL will now report the real problem.
      await queryInterface.sequelize.query("SET LOCAL lock_timeout = '8s'", { transaction });
      await queryInterface.sequelize.query("SET LOCAL statement_timeout = '180s'", { transaction });

      const tables = (await queryInterface.showAllTables({ transaction }))
        .map((table) => String(table).toLowerCase());
      if (!tables.includes('purchase_audit_events')) {
        await queryInterface.createTable('purchase_audit_events', {
          id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
          id_input: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'inputs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_sucursal: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'sucursals', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_detail_input: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'details_inputs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_account_payable: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'accounts_payables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_abono_account_payable: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'abonos_accounts_payables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_actor_user: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          id_authorizer_user: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
          entity_type: { type: Sequelize.STRING(40), allowNull: false },
          entity_id: { type: Sequelize.BIGINT, allowNull: true },
          event_type: { type: Sequelize.STRING(60), allowNull: false },
          reason: { type: Sequelize.TEXT, allowNull: true },
          before_data: { type: Sequelize.JSONB, allowNull: true },
          after_data: { type: Sequelize.JSONB, allowNull: true },
          changed_fields: { type: Sequelize.JSONB, allowNull: true },
          correlation_id: { type: Sequelize.UUID, allowNull: false },
          idempotency_key: { type: Sequelize.STRING(160), allowNull: true },
          historical_incomplete: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        }, { transaction });
      }

      const userRef = { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' };
      await addColumnsIfMissing(queryInterface, 'inputs', {
        updated_by: userRef,
        voided_by: userRef,
        voided_at: { type: Sequelize.DATE, allowNull: true },
        void_reason: { type: Sequelize.TEXT, allowNull: true },
      }, transaction);
      await addColumnsIfMissing(queryInterface, 'details_inputs', {
        created_by: userRef,
        updated_by: userRef,
        removed_by: userRef,
        removed_at: { type: Sequelize.DATE, allowNull: true },
        removal_reason: { type: Sequelize.TEXT, allowNull: true },
      }, transaction);
      await addColumnsIfMissing(queryInterface, 'accounts_payables', {
        updated_by: userRef,
        voided_by: userRef,
        voided_at: { type: Sequelize.DATE, allowNull: true },
        void_reason: { type: Sequelize.TEXT, allowNull: true },
        superseded_by: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'accounts_payables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      }, transaction);
      await addColumnsIfMissing(queryInterface, 'abonos_accounts_payables', {
        voided_by: userRef,
        voided_at: { type: Sequelize.DATE, allowNull: true },
        void_reason: { type: Sequelize.TEXT, allowNull: true },
      }, transaction);

      const indexes = await queryInterface.showIndex('purchase_audit_events', { transaction });
      const addIndex = async (fields, name, unique = false) => {
        if (!indexes.some((index) => index.name === name)) await queryInterface.addIndex('purchase_audit_events', fields, { name, unique, transaction });
      };
      await addIndex(['id_input', 'createdAt'], 'purchase_audit_input_date_idx');
      await addIndex(['id_actor_user', 'createdAt'], 'purchase_audit_actor_date_idx');
      await addIndex(['event_type', 'createdAt'], 'purchase_audit_event_date_idx');
      await addIndex(['correlation_id'], 'purchase_audit_correlation_idx');
      await addIndex(['idempotency_key'], 'purchase_audit_idempotency_uq', true);

      await queryInterface.sequelize.query(`
        CREATE OR REPLACE FUNCTION prevent_purchase_audit_mutation()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Los eventos de trazabilidad de compras son inmutables';
        END;
        $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS purchase_audit_events_immutable ON purchase_audit_events;
        CREATE TRIGGER purchase_audit_events_immutable
        BEFORE UPDATE OR DELETE ON purchase_audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_purchase_audit_mutation();
      `, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      const databaseError = error.original || error.parent || error;
      if (databaseError.code === '55P03' || /lock timeout/i.test(databaseError.message || '')) {
        throw new Error(
          'La migracion de trazabilidad no pudo obtener acceso exclusivo a las tablas. ' +
          'Detenga las instancias del backend que usan esta base de datos y vuelva a ejecutar la migracion.',
          { cause: error },
        );
      }
      throw error;
    }
  },

  async down() {
    // Intentionally non-destructive. Audit records, their immutability trigger,
    // and the metadata referenced by existing events must survive a rollback.
    // A functional rollback disables new writes/views at application level.
    console.info(
      '[purchase-audit] Rollback conservador: se preservan tabla, eventos y metadatos de trazabilidad.',
    );
  },
};

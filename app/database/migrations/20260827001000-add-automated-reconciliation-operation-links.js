'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const actions = 'transfer_review_resolution_actions';
    const movements = 'transfer_review_action_movements';

    await queryInterface.addColumn(actions, 'operation_mode', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'VERIFIED_EXISTING',
    });
    await queryInterface.addColumn(actions, 'operation_type', { type: Sequelize.STRING });
    await queryInterface.addColumn(actions, 'operation_id', { type: Sequelize.INTEGER });
    await queryInterface.addColumn(actions, 'operation_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'ACTIVE',
    });
    await queryInterface.addColumn(actions, 'detail_version', {
      type: Sequelize.BIGINT,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.addColumn(actions, 'reversal_reason', { type: Sequelize.TEXT });
    await queryInterface.addColumn(actions, 'reversed_at', { type: Sequelize.DATE });
    await queryInterface.addColumn(actions, 'id_reversed_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await queryInterface.addColumn(movements, 'movement_role', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'ORIGINAL',
    });
    await queryInterface.addColumn(movements, 'id_compensates_movement', {
      type: Sequelize.INTEGER,
      references: { model: 'kardex_movements', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addIndex(actions, ['operation_type', 'operation_id'], {
      name: 'transfer_review_actions_operation_idx',
    });
    await queryInterface.addIndex(movements, ['id_transfer_review_resolution_action', 'movement_role'], {
      name: 'transfer_review_action_movements_role_idx',
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX transfer_review_actions_active_automatic_detail_uq
      ON transfer_review_resolution_actions (id_transfer_review_note_detail, detail_version)
      WHERE operation_mode = 'CREATED_AUTOMATICALLY'
        AND operation_status IN ('ACTIVE', 'PENDING_RECEPTION', 'REVERSAL_PENDING')
        AND management_status = 'ACTIVA'
    `);

    await queryInterface.sequelize.query(`
      UPDATE transfer_review_resolution_actions a
      SET operation_mode = 'VERIFIED_EXISTING',
          operation_type = CASE
            WHEN UPPER(COALESCE(a.observations, '')) LIKE '%CLASIF%' THEN 'CLASSIFIED'
            WHEN UPPER(COALESCE(a.observations, '')) LIKE '%TRAS%' THEN 'TRANSFER'
            ELSE NULL
          END
    `);
    await queryInterface.sequelize.query(`
      UPDATE transfer_review_resolution_actions a
      SET operation_mode = 'VERIFIED_EXISTING',
          operation_type = e.metadata->>'operational_document_type',
          operation_id = NULLIF(e.metadata->>'operational_document_id', '')::integer
      FROM transfer_review_events e
      WHERE e.event_type = 'SIN_AJUSTE_INVENTARIO'
        AND e.metadata->>'operational_verification' = 'true'
        AND NULLIF(e.metadata->>'action_id', '')::integer = a.id
        AND NULLIF(e.metadata->>'operational_document_id', '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM transfer_review_events duplicate
          WHERE duplicate.event_type = 'SIN_AJUSTE_INVENTARIO'
            AND NULLIF(duplicate.metadata->>'action_id', '')::integer = a.id
            AND duplicate.id <> e.id
            AND (
              duplicate.metadata->>'operational_document_type' IS DISTINCT FROM e.metadata->>'operational_document_type'
              OR duplicate.metadata->>'operational_document_id' IS DISTINCT FROM e.metadata->>'operational_document_id'
            )
        )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS transfer_review_actions_active_automatic_detail_uq');
    await queryInterface.removeIndex('transfer_review_action_movements', 'transfer_review_action_movements_role_idx');
    await queryInterface.removeIndex('transfer_review_resolution_actions', 'transfer_review_actions_operation_idx');
    await queryInterface.removeColumn('transfer_review_action_movements', 'id_compensates_movement');
    await queryInterface.removeColumn('transfer_review_action_movements', 'movement_role');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'id_reversed_user');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'reversed_at');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'reversal_reason');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'detail_version');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'operation_status');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'operation_id');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'operation_type');
    await queryInterface.removeColumn('transfer_review_resolution_actions', 'operation_mode');
  },
};

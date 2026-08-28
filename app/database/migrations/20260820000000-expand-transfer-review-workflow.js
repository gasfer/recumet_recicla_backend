'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transfer_review_notes', 'reconciliation_status', {
      allowNull: false,
      type: Sequelize.ENUM('EN_REVISION', 'PARCIAL', 'COMPLETADO'),
      defaultValue: 'EN_REVISION',
    });
    await queryInterface.addColumn('transfer_review_notes', 'id_assigned_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('transfer_review_notes', 'assigned_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_notes', 'resolved_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_notes', 'id_resolved_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addColumn('transfer_review_notes', 'reopened_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_notes', 'id_reopened_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('transfer_review_note_details', 'reconciliation_status', {
      allowNull: false,
      type: Sequelize.ENUM('EN_REVISION', 'COMPLETADO'),
      defaultValue: 'EN_REVISION',
    });
    await queryInterface.addColumn('transfer_review_note_details', 'cause', { type: Sequelize.STRING });
    await queryInterface.addColumn('transfer_review_note_details', 'quantity_resolved', {
      allowNull: false,
      type: Sequelize.DECIMAL(14, 4),
      defaultValue: 0,
    });
    await queryInterface.addColumn('transfer_review_note_details', 'resolved_at', { type: Sequelize.DATE });
    await queryInterface.addColumn('transfer_review_note_details', 'id_resolved_user', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.createTable('transfer_review_events', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      event_type: { allowNull: false, type: Sequelize.STRING },
      description: { allowNull: false, type: Sequelize.TEXT },
      metadata: { allowNull: false, type: Sequelize.JSONB, defaultValue: {} },
      id_transfer_review_note: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_notes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('transfer_review_evidences', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      evidence_type: { allowNull: false, type: Sequelize.STRING },
      file_name: { type: Sequelize.STRING },
      file_url: { type: Sequelize.TEXT },
      description: { type: Sequelize.TEXT },
      checksum: { type: Sequelize.STRING },
      id_transfer_review_note: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_notes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('transfer_review_resolution_actions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      idempotency_key: { allowNull: false, type: Sequelize.STRING, unique: true },
      strategy: { allowNull: false, type: Sequelize.STRING },
      quantity: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      observations: { type: Sequelize.TEXT },
      approved_at: { type: Sequelize.DATE },
      id_transfer_review_note: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_notes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_transfer_review_note_detail: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_note_details', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_approved_user: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('transfer_review_action_movements', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_transfer_review_resolution_action: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_resolution_actions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_kardex_movement: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'kardex_movements', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addIndex('transfer_review_notes', ['id_sucursal', 'id_storage', 'reconciliation_status'], { name: 'transfer_review_notes_context_status_idx' });
    await queryInterface.addIndex('transfer_review_notes', ['id_assigned_user', 'reconciliation_status'], { name: 'transfer_review_notes_assignee_status_idx' });
    await queryInterface.addIndex('transfer_review_note_details', ['id_product', 'reconciliation_status'], { name: 'transfer_review_details_product_status_idx' });
    await queryInterface.addIndex('transfer_review_events', ['id_transfer_review_note', 'createdAt'], { name: 'transfer_review_events_timeline_idx' });
    await queryInterface.addIndex('transfer_review_evidences', ['id_transfer_review_note'], { name: 'transfer_review_evidences_note_idx' });
    await queryInterface.addConstraint('transfer_review_action_movements', {
      fields: ['id_transfer_review_resolution_action', 'id_kardex_movement'],
      type: 'unique',
      name: 'transfer_review_action_movement_unique',
    });
    await queryInterface.addColumn('notifications', 'idempotency_key', { type: Sequelize.STRING });
    await queryInterface.addIndex('notifications', ['idempotency_key'], {
      unique: true,
      name: 'notifications_idempotency_key_unique',
    });

    await queryInterface.sequelize.query(`
      UPDATE transfer_review_notes
      SET reconciliation_status = 'EN_REVISION'
      WHERE reconciliation_status IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE transfer_review_note_details
      SET reconciliation_status = 'EN_REVISION', quantity_resolved = 0
      WHERE reconciliation_status IS NULL OR quantity_resolved IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('notifications', 'notifications_idempotency_key_unique');
    await queryInterface.removeColumn('notifications', 'idempotency_key');
    await queryInterface.dropTable('transfer_review_action_movements');
    await queryInterface.dropTable('transfer_review_resolution_actions');
    await queryInterface.dropTable('transfer_review_evidences');
    await queryInterface.dropTable('transfer_review_events');
    await queryInterface.removeIndex('transfer_review_note_details', 'transfer_review_details_product_status_idx');
    await queryInterface.removeColumn('transfer_review_note_details', 'id_resolved_user');
    await queryInterface.removeColumn('transfer_review_note_details', 'resolved_at');
    await queryInterface.removeColumn('transfer_review_note_details', 'quantity_resolved');
    await queryInterface.removeColumn('transfer_review_note_details', 'cause');
    await queryInterface.removeColumn('transfer_review_note_details', 'reconciliation_status');
    await queryInterface.removeIndex('transfer_review_notes', 'transfer_review_notes_assignee_status_idx');
    await queryInterface.removeIndex('transfer_review_notes', 'transfer_review_notes_context_status_idx');
    await queryInterface.removeColumn('transfer_review_notes', 'id_reopened_user');
    await queryInterface.removeColumn('transfer_review_notes', 'reopened_at');
    await queryInterface.removeColumn('transfer_review_notes', 'id_resolved_user');
    await queryInterface.removeColumn('transfer_review_notes', 'resolved_at');
    await queryInterface.removeColumn('transfer_review_notes', 'assigned_at');
    await queryInterface.removeColumn('transfer_review_notes', 'id_assigned_user');
    await queryInterface.removeColumn('transfer_review_notes', 'reconciliation_status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transfer_review_note_details_reconciliation_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transfer_review_notes_reconciliation_status";');
  },
};

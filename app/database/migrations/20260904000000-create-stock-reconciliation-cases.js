'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const userReference = { model: 'users', key: 'id' };
    await queryInterface.createTable('stock_reconciliation_cases', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      fingerprint: { allowNull: false, type: Sequelize.STRING },
      status: { allowNull: false, type: Sequelize.STRING, defaultValue: 'DETECTADA' },
      direction: { allowNull: false, type: Sequelize.STRING },
      physical_stock_observed: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      kardex_balance_observed: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      difference_observed: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      physical_count: { type: Sequelize.DECIMAL(18, 4) },
      cause: { type: Sequelize.STRING },
      investigation_notes: { type: Sequelize.TEXT },
      selected_strategy: { type: Sequelize.STRING },
      source_reference_type: { type: Sequelize.STRING },
      source_reference_code: { type: Sequelize.STRING },
      candidate_documents: { allowNull: false, type: Sequelize.JSONB, defaultValue: [] },
      detected_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      last_detected_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      authorized_at: { type: Sequelize.DATE },
      resolved_at: { type: Sequelize.DATE },
      id_product: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_sucursal: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'sucursals', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_storage: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'storages', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_assigned_user: { type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      id_authorized_user: { type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      id_resolved_user: { type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.createTable('stock_reconciliation_events', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      event_type: { allowNull: false, type: Sequelize.STRING },
      description: { allowNull: false, type: Sequelize.TEXT },
      metadata: { allowNull: false, type: Sequelize.JSONB, defaultValue: {} },
      id_stock_reconciliation_case: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'stock_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.createTable('stock_reconciliation_evidences', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      evidence_type: { allowNull: false, type: Sequelize.STRING },
      reference: { allowNull: false, type: Sequelize.STRING },
      description: { allowNull: false, type: Sequelize.TEXT },
      id_stock_reconciliation_case: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'stock_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.createTable('stock_reconciliation_decisions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      strategy: { allowNull: false, type: Sequelize.STRING },
      physical_count: { type: Sequelize.DECIMAL(18, 4) },
      cause: { type: Sequelize.STRING },
      notes: { allowNull: false, type: Sequelize.TEXT },
      source_reference_type: { type: Sequelize.STRING },
      source_reference_code: { type: Sequelize.STRING },
      id_stock_reconciliation_case: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'stock_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.createTable('stock_reconciliation_authorizations', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      strategy: { allowNull: false, type: Sequelize.STRING },
      snapshot_fingerprint: { allowNull: false, type: Sequelize.STRING },
      status: { allowNull: false, type: Sequelize.STRING, defaultValue: 'AUTORIZADA' },
      id_stock_reconciliation_case: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'stock_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_requested_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_authorized_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      authorized_at: { allowNull: false, type: Sequelize.DATE },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.createTable('stock_reconciliation_actions', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      idempotency_key: { allowNull: false, type: Sequelize.STRING, unique: true },
      strategy: { allowNull: false, type: Sequelize.STRING },
      status: { allowNull: false, type: Sequelize.STRING, defaultValue: 'CONFIRMADA' },
      stock_before: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      kardex_before: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      stock_after: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      kardex_after: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      difference_after: { allowNull: false, type: Sequelize.DECIMAL(18, 4) },
      id_stock_reconciliation_case: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'stock_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_kardex_movement: { type: Sequelize.INTEGER, references: { model: 'kardex_movements', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_authorized_user: { allowNull: false, type: Sequelize.INTEGER, references: userReference, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('stock_reconciliation_cases', ['id_sucursal', 'id_storage', 'status'], { name: 'stock_reconciliation_case_context_status_idx' });
    await queryInterface.addIndex('stock_reconciliation_cases', ['id_product', 'id_sucursal', 'id_storage'], {
      name: 'stock_reconciliation_one_open_location_idx', unique: true, where: { status: { [Sequelize.Op.ne]: 'RESUELTA' } },
    });
    await queryInterface.addIndex('stock_reconciliation_events', ['id_stock_reconciliation_case', 'createdAt'], { name: 'stock_reconciliation_event_timeline_idx' });
    await queryInterface.addIndex('stock_reconciliation_evidences', ['id_stock_reconciliation_case'], { name: 'stock_reconciliation_evidence_case_idx' });
    await queryInterface.addIndex('stock_reconciliation_decisions', ['id_stock_reconciliation_case', 'createdAt'], { name: 'stock_reconciliation_decision_case_idx' });
    await queryInterface.addIndex('stock_reconciliation_authorizations', ['id_stock_reconciliation_case', 'createdAt'], { name: 'stock_reconciliation_authorization_case_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stock_reconciliation_actions');
    await queryInterface.dropTable('stock_reconciliation_authorizations');
    await queryInterface.dropTable('stock_reconciliation_decisions');
    await queryInterface.dropTable('stock_reconciliation_evidences');
    await queryInterface.dropTable('stock_reconciliation_events');
    await queryInterface.dropTable('stock_reconciliation_cases');
  },
};

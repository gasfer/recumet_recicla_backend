'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationCase extends Model {
    static associate(models) {
      StockReconciliationCase.belongsTo(models.Product, { as: 'product', foreignKey: 'id_product' });
      StockReconciliationCase.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      StockReconciliationCase.belongsTo(models.Storage, { as: 'storage', foreignKey: 'id_storage' });
      StockReconciliationCase.belongsTo(models.User, { as: 'assignedUser', foreignKey: 'id_assigned_user' });
      StockReconciliationCase.belongsTo(models.User, { as: 'authorizedUser', foreignKey: 'id_authorized_user' });
      StockReconciliationCase.belongsTo(models.User, { as: 'resolvedUser', foreignKey: 'id_resolved_user' });
      StockReconciliationCase.hasMany(models.StockReconciliationEvent, { as: 'events', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationCase.hasMany(models.StockReconciliationEvidence, { as: 'evidences', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationCase.hasMany(models.StockReconciliationDecision, { as: 'decisions', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationCase.hasMany(models.StockReconciliationAuthorization, { as: 'authorizations', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationCase.hasMany(models.StockReconciliationAction, { as: 'actions', foreignKey: 'id_stock_reconciliation_case' });
    }
  }

  StockReconciliationCase.init({
    fingerprint: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'DETECTADA' },
    direction: { type: DataTypes.STRING, allowNull: false },
    physical_stock_observed: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    kardex_balance_observed: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    difference_observed: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    physical_count: DataTypes.DECIMAL(18, 4),
    cause: DataTypes.STRING,
    investigation_notes: DataTypes.TEXT,
    selected_strategy: DataTypes.STRING,
    source_reference_type: DataTypes.STRING,
    source_reference_code: DataTypes.STRING,
    candidate_documents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    detected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_detected_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    authorized_at: DataTypes.DATE,
    resolved_at: DataTypes.DATE,
    id_product: { type: DataTypes.INTEGER, allowNull: false },
    id_sucursal: { type: DataTypes.INTEGER, allowNull: false },
    id_storage: { type: DataTypes.INTEGER, allowNull: false },
    id_assigned_user: DataTypes.INTEGER,
    id_authorized_user: DataTypes.INTEGER,
    id_resolved_user: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'StockReconciliationCase',
    tableName: 'stock_reconciliation_cases',
  });
  return StockReconciliationCase;
};

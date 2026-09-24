'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationDecision extends Model {
    static associate(models) {
      StockReconciliationDecision.belongsTo(models.StockReconciliationCase, { as: 'case', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationDecision.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }

  StockReconciliationDecision.init({
    strategy: { type: DataTypes.STRING, allowNull: false },
    physical_count: DataTypes.DECIMAL(18, 4),
    cause: DataTypes.STRING,
    notes: { type: DataTypes.TEXT, allowNull: false },
    source_reference_type: DataTypes.STRING,
    source_reference_code: DataTypes.STRING,
    id_stock_reconciliation_case: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, { sequelize, modelName: 'StockReconciliationDecision', tableName: 'stock_reconciliation_decisions' });
  return StockReconciliationDecision;
};

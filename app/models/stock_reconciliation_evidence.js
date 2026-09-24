'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationEvidence extends Model {
    static associate(models) {
      StockReconciliationEvidence.belongsTo(models.StockReconciliationCase, { as: 'case', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationEvidence.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }
  StockReconciliationEvidence.init({
    evidence_type: { type: DataTypes.STRING, allowNull: false },
    reference: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    id_stock_reconciliation_case: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, { sequelize, modelName: 'StockReconciliationEvidence', tableName: 'stock_reconciliation_evidences' });
  return StockReconciliationEvidence;
};

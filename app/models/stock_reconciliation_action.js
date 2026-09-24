'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationAction extends Model {
    static associate(models) {
      StockReconciliationAction.belongsTo(models.StockReconciliationCase, { as: 'case', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationAction.belongsTo(models.kardexMovements, { as: 'kardexMovement', foreignKey: 'id_kardex_movement' });
      StockReconciliationAction.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      StockReconciliationAction.belongsTo(models.User, { as: 'authorizedUser', foreignKey: 'id_authorized_user' });
      StockReconciliationAction.belongsTo(models.User, { as: 'countResponsible', foreignKey: 'id_count_responsible_user' });
    }
  }
  StockReconciliationAction.init({
    idempotency_key: { type: DataTypes.STRING, allowNull: false, unique: true },
    strategy: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'CONFIRMADA' },
    stock_before: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    kardex_before: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    stock_after: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    kardex_after: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    difference_after: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    id_stock_reconciliation_case: { type: DataTypes.INTEGER, allowNull: false },
    id_kardex_movement: DataTypes.INTEGER,
    id_user: { type: DataTypes.INTEGER, allowNull: false },
    id_authorized_user: { type: DataTypes.INTEGER, allowNull: false },
    registry_number: DataTypes.STRING,
    count_description: DataTypes.TEXT,
    id_count_responsible_user: DataTypes.INTEGER,
  }, { sequelize, modelName: 'StockReconciliationAction', tableName: 'stock_reconciliation_actions' });
  return StockReconciliationAction;
};

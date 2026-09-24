'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationEvent extends Model {
    static associate(models) {
      StockReconciliationEvent.belongsTo(models.StockReconciliationCase, { as: 'case', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationEvent.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }
  StockReconciliationEvent.init({
    event_type: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    id_stock_reconciliation_case: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    sequelize,
    modelName: 'StockReconciliationEvent',
    tableName: 'stock_reconciliation_events',
    hooks: {
      beforeUpdate() { throw new Error('Los eventos de conciliación son inmutables.'); },
      beforeDestroy() { throw new Error('Los eventos de conciliación son inmutables.'); },
    },
  });
  return StockReconciliationEvent;
};

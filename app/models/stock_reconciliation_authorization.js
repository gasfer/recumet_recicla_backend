'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class StockReconciliationAuthorization extends Model {
    static associate(models) {
      StockReconciliationAuthorization.belongsTo(models.StockReconciliationCase, { as: 'case', foreignKey: 'id_stock_reconciliation_case' });
      StockReconciliationAuthorization.belongsTo(models.User, { as: 'requestedUser', foreignKey: 'id_requested_user' });
      StockReconciliationAuthorization.belongsTo(models.User, { as: 'authorizedUser', foreignKey: 'id_authorized_user' });
    }
  }

  StockReconciliationAuthorization.init({
    strategy: { type: DataTypes.STRING, allowNull: false },
    snapshot_fingerprint: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'AUTORIZADA' },
    authorized_at: { type: DataTypes.DATE, allowNull: false },
    id_stock_reconciliation_case: { type: DataTypes.INTEGER, allowNull: false },
    id_requested_user: { type: DataTypes.INTEGER, allowNull: false },
    id_authorized_user: { type: DataTypes.INTEGER, allowNull: false },
  }, { sequelize, modelName: 'StockReconciliationAuthorization', tableName: 'stock_reconciliation_authorizations' });
  return StockReconciliationAuthorization;
};

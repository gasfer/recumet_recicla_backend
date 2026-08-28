'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PurchaseAuditEvent extends Model {
    static associate(models) {
      PurchaseAuditEvent.belongsTo(models.Input, { as: 'input', foreignKey: 'id_input' });
      PurchaseAuditEvent.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      PurchaseAuditEvent.belongsTo(models.DetailsInput, { as: 'detail', foreignKey: 'id_detail_input' });
      PurchaseAuditEvent.belongsTo(models.AccountsPayable, { as: 'accountPayable', foreignKey: 'id_account_payable' });
      PurchaseAuditEvent.belongsTo(models.AbonosAccountsPayable, { as: 'payment', foreignKey: 'id_abono_account_payable' });
      PurchaseAuditEvent.belongsTo(models.User, { as: 'actor', foreignKey: 'id_actor_user' });
      PurchaseAuditEvent.belongsTo(models.User, { as: 'authorizer', foreignKey: 'id_authorizer_user' });
    }
  }

  PurchaseAuditEvent.init({
    id_input: { type: DataTypes.INTEGER, allowNull: false },
    id_sucursal: DataTypes.INTEGER,
    id_detail_input: DataTypes.INTEGER,
    id_account_payable: DataTypes.INTEGER,
    id_abono_account_payable: DataTypes.INTEGER,
    id_actor_user: { type: DataTypes.INTEGER, allowNull: false },
    id_authorizer_user: DataTypes.INTEGER,
    entity_type: { type: DataTypes.STRING, allowNull: false },
    entity_id: DataTypes.BIGINT,
    event_type: { type: DataTypes.STRING, allowNull: false },
    reason: DataTypes.TEXT,
    before_data: DataTypes.JSONB,
    after_data: DataTypes.JSONB,
    changed_fields: DataTypes.JSONB,
    correlation_id: { type: DataTypes.UUID, allowNull: false },
    idempotency_key: { type: DataTypes.STRING, unique: true },
    historical_incomplete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    sequelize,
    modelName: 'PurchaseAuditEvent',
    tableName: 'purchase_audit_events',
  });

  return PurchaseAuditEvent;
};

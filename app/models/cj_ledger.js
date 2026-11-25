'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjLedger extends Model {
    static associate(models) {
      CjLedger.belongsTo(models.CajaSmall, { as: 'session', foreignKey: 'id_caja_small' });
      CjLedger.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
      CjLedger.belongsTo(models.DetailsCajaSmall, { as: 'movement', foreignKey: 'id_detail_caja_small' });
      CjLedger.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      CjLedger.belongsTo(models.CjLedger, { as: 'reversedEntry', foreignKey: 'reversal_of' });
    }
  }
  CjLedger.init({ id_caja_small: DataTypes.INTEGER, id_cuenta: DataTypes.INTEGER, id_detail_caja_small: DataTypes.INTEGER, direction: DataTypes.STRING, amount: DataTypes.DECIMAL, currency: DataTypes.STRING, source_type: DataTypes.STRING, source_id: DataTypes.STRING, idempotency_key: DataTypes.STRING, id_user: DataTypes.INTEGER, posted_at: DataTypes.DATE, reversal_of: DataTypes.BIGINT, reason: DataTypes.TEXT }, { sequelize, modelName: 'CjLedger', tableName: 'cj_ledger' });
  return CjLedger;
};

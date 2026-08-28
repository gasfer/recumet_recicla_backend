'use strict';
const { Model } = require('sequelize');
const { formattedDecimalQuantitySetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewResolutionAction extends Model {
    static associate(models) {
      TransferReviewResolutionAction.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferReviewResolutionAction.belongsTo(models.TransferReviewNoteDetail, { as: 'reviewDetail', foreignKey: 'id_transfer_review_note_detail' });
      TransferReviewResolutionAction.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      TransferReviewResolutionAction.belongsTo(models.User, { as: 'approvedUser', foreignKey: 'id_approved_user' });
      TransferReviewResolutionAction.belongsTo(models.User, { as: 'reversedUser', foreignKey: 'id_reversed_user' });
      TransferReviewResolutionAction.hasMany(models.TransferReviewActionMovement, { as: 'movementLinks', foreignKey: 'id_transfer_review_resolution_action' });
    }
  }

  TransferReviewResolutionAction.init({
    idempotency_key: { type: DataTypes.STRING, allowNull: false, unique: true },
    strategy: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL, allowNull: false, set(value) { this.setDataValue('quantity', formattedDecimalQuantitySetter(value)); } },
    observations: DataTypes.TEXT,
    approved_at: DataTypes.DATE,
    id_transfer_review_note: { type: DataTypes.INTEGER, allowNull: false },
    id_transfer_review_note_detail: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
    id_approved_user: DataTypes.INTEGER,
    management_status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ACTIVA' },
    operation_mode: { type: DataTypes.STRING, allowNull: false, defaultValue: 'VERIFIED_EXISTING' },
    operation_type: DataTypes.STRING,
    operation_id: DataTypes.INTEGER,
    operation_status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ACTIVE' },
    detail_version: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 },
    reversal_reason: DataTypes.TEXT,
    reversed_at: DataTypes.DATE,
    id_reversed_user: DataTypes.INTEGER,
  }, { sequelize, modelName: 'TransferReviewResolutionAction', tableName: 'transfer_review_resolution_actions' });
  return TransferReviewResolutionAction;
};

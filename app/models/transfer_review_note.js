'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewNote extends Model {
    static associate(models) {
      TransferReviewNote.belongsTo(models.Transfers, { as: 'transfer', foreignKey: 'id_transfer' });
      TransferReviewNote.belongsTo(models.kardexMovements, { as: 'kardexMovement', foreignKey: 'id_kardex_movement' });
      TransferReviewNote.belongsTo(models.Product, { as: 'registeredProduct', foreignKey: 'id_product' });
      TransferReviewNote.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      TransferReviewNote.belongsTo(models.User, { as: 'assignedUser', foreignKey: 'id_assigned_user' });
      TransferReviewNote.belongsTo(models.User, { as: 'resolvedUser', foreignKey: 'id_resolved_user' });
      TransferReviewNote.belongsTo(models.User, { as: 'reopenedUser', foreignKey: 'id_reopened_user' });
      TransferReviewNote.belongsTo(models.User, { as: 'revertedUser', foreignKey: 'id_reverted_user' });
      TransferReviewNote.belongsTo(models.User, { as: 'deletedUser', foreignKey: 'id_deleted_user' });
      TransferReviewNote.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      TransferReviewNote.belongsTo(models.Storage, { as: 'storage', foreignKey: 'id_storage' });
      TransferReviewNote.hasMany(models.TransferReviewNoteDetail, { as: 'details', foreignKey: 'id_transfer_review_note' });
      TransferReviewNote.hasMany(models.TransferReviewEvent, { as: 'events', foreignKey: 'id_transfer_review_note' });
      TransferReviewNote.hasMany(models.TransferReviewEvidence, { as: 'evidences', foreignKey: 'id_transfer_review_note' });
      TransferReviewNote.hasMany(models.TransferReviewResolutionAction, { as: 'resolutionActions', foreignKey: 'id_transfer_review_note' });
    }
  }

  TransferReviewNote.init({
    registry_number: DataTypes.STRING,
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    observations: DataTypes.TEXT,
    id_transfer: DataTypes.INTEGER,
    id_kardex_movement: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    reconciliation_status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'EN_REVISION' },
    id_assigned_user: DataTypes.INTEGER,
    assigned_at: DataTypes.DATE,
    resolved_at: DataTypes.DATE,
    id_resolved_user: DataTypes.INTEGER,
    reopened_at: DataTypes.DATE,
    id_reopened_user: DataTypes.INTEGER,
    management_status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ACTIVA' },
    management_reason: DataTypes.TEXT,
    reverted_at: DataTypes.DATE,
    id_reverted_user: DataTypes.INTEGER,
    deleted_at: DataTypes.DATE,
    id_deleted_user: DataTypes.INTEGER
  }, { sequelize, modelName: 'TransferReviewNote', tableName: 'transfer_review_notes' });
  return TransferReviewNote;
};

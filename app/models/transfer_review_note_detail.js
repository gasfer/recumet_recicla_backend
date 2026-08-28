'use strict';
const { Model } = require('sequelize');
const { formattedDecimalQuantitySetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewNoteDetail extends Model {
    static associate(models) {
      TransferReviewNoteDetail.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferReviewNoteDetail.belongsTo(models.DetailsTransfers, { as: 'transferDetail', foreignKey: 'id_detail_transfer' });
      TransferReviewNoteDetail.belongsTo(models.Product, { as: 'product', foreignKey: 'id_product' });
      TransferReviewNoteDetail.belongsTo(models.User, { as: 'resolvedUser', foreignKey: 'id_resolved_user' });
      TransferReviewNoteDetail.hasMany(models.TransferReviewResolutionAction, { as: 'resolutionActions', foreignKey: 'id_transfer_review_note_detail' });
      TransferReviewNoteDetail.hasMany(models.TransferReviewInventoryHold, { as: 'inventoryHolds', foreignKey: 'id_transfer_review_note_detail' });
    }
  }

  TransferReviewNoteDetail.init({
    quantity_sent: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_sent', formattedDecimalQuantitySetter(value)); } },
    quantity_received: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_received', formattedDecimalQuantitySetter(value)); } },
    quantity_difference: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_difference', formattedDecimalQuantitySetter(value)); } },
    id_transfer_review_note: DataTypes.INTEGER,
    id_detail_transfer: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    reconciliation_status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'EN_REVISION' },
    cause: DataTypes.STRING,
    quantity_resolved: { type: DataTypes.DECIMAL, allowNull: false, defaultValue: 0, set(value) { this.setDataValue('quantity_resolved', formattedDecimalQuantitySetter(value)); } },
    resolved_at: DataTypes.DATE,
    id_resolved_user: DataTypes.INTEGER
  }, { sequelize, modelName: 'TransferReviewNoteDetail', tableName: 'transfer_review_note_details' });
  return TransferReviewNoteDetail;
};

'use strict';
const { Model } = require('sequelize');
const { formattedDecimalQuantitySetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewNoteDetail extends Model {
    static associate(models) {
      TransferReviewNoteDetail.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferReviewNoteDetail.belongsTo(models.DetailsTransfers, { as: 'transferDetail', foreignKey: 'id_detail_transfer' });
      TransferReviewNoteDetail.belongsTo(models.Product, { as: 'product', foreignKey: 'id_product' });
    }
  }

  TransferReviewNoteDetail.init({
    quantity_sent: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_sent', formattedDecimalQuantitySetter(value)); } },
    quantity_received: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_received', formattedDecimalQuantitySetter(value)); } },
    quantity_difference: { type: DataTypes.DECIMAL, set(value) { this.setDataValue('quantity_difference', formattedDecimalQuantitySetter(value)); } },
    id_transfer_review_note: DataTypes.INTEGER,
    id_detail_transfer: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER
  }, { sequelize, modelName: 'TransferReviewNoteDetail', tableName: 'transfer_review_note_details' });
  return TransferReviewNoteDetail;
};

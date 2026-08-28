'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewEvent extends Model {
    static associate(models) {
      TransferReviewEvent.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferReviewEvent.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }

  TransferReviewEvent.init({
    event_type: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    id_transfer_review_note: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, { sequelize, modelName: 'TransferReviewEvent', tableName: 'transfer_review_events' });
  return TransferReviewEvent;
};

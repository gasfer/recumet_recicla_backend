'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewEvidence extends Model {
    static associate(models) {
      TransferReviewEvidence.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferReviewEvidence.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }

  TransferReviewEvidence.init({
    evidence_type: { type: DataTypes.STRING, allowNull: false },
    file_name: DataTypes.STRING,
    file_url: DataTypes.TEXT,
    description: DataTypes.TEXT,
    checksum: DataTypes.STRING,
    id_transfer_review_note: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, { sequelize, modelName: 'TransferReviewEvidence', tableName: 'transfer_review_evidences' });
  return TransferReviewEvidence;
};

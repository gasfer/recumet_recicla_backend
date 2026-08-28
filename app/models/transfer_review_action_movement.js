'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewActionMovement extends Model {
    static associate(models) {
      TransferReviewActionMovement.belongsTo(models.TransferReviewResolutionAction, { as: 'resolutionAction', foreignKey: 'id_transfer_review_resolution_action' });
      TransferReviewActionMovement.belongsTo(models.kardexMovements, { as: 'kardexMovement', foreignKey: 'id_kardex_movement' });
      TransferReviewActionMovement.belongsTo(models.kardexMovements, { as: 'compensatesMovement', foreignKey: 'id_compensates_movement' });
    }
  }

  TransferReviewActionMovement.init({
    id_transfer_review_resolution_action: { type: DataTypes.INTEGER, allowNull: false },
    id_kardex_movement: { type: DataTypes.INTEGER, allowNull: false },
    movement_role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ORIGINAL' },
    id_compensates_movement: DataTypes.INTEGER,
  }, { sequelize, modelName: 'TransferReviewActionMovement', tableName: 'transfer_review_action_movements' });
  return TransferReviewActionMovement;
};

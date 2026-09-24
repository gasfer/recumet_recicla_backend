'use strict';

const { Model } = require('sequelize');
const { formattedDecimalQuantitySetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class TransferHistoricalDifferenceCompletion extends Model {
    static associate(models) {
      TransferHistoricalDifferenceCompletion.belongsTo(models.Transfers, { as: 'transfer', foreignKey: 'id_transfer' });
      TransferHistoricalDifferenceCompletion.belongsTo(models.DetailsTransfers, { as: 'transferDetail', foreignKey: 'id_detail_transfer' });
      TransferHistoricalDifferenceCompletion.belongsTo(models.TransferReviewNote, { as: 'reviewNote', foreignKey: 'id_transfer_review_note' });
      TransferHistoricalDifferenceCompletion.belongsTo(models.kardexMovements, { as: 'kardexMovement', foreignKey: 'id_kardex_movement' });
      TransferHistoricalDifferenceCompletion.belongsTo(models.Product, { as: 'registeredProduct', foreignKey: 'id_product' });
      TransferHistoricalDifferenceCompletion.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }

  TransferHistoricalDifferenceCompletion.init({
    idempotency_key: { type: DataTypes.STRING, allowNull: false, unique: true },
    completion_type: { type: DataTypes.STRING, allowNull: false },
    quantity: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      set(value) { this.setDataValue('quantity', formattedDecimalQuantitySetter(value)); },
    },
    allocations: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    projection_fingerprint: { type: DataTypes.STRING, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ACTIVE' },
    id_transfer: { type: DataTypes.INTEGER, allowNull: false },
    id_detail_transfer: DataTypes.INTEGER,
    id_transfer_review_note: { type: DataTypes.INTEGER, allowNull: false },
    id_kardex_movement: { type: DataTypes.INTEGER, allowNull: false },
    id_product: { type: DataTypes.INTEGER, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    sequelize,
    modelName: 'TransferHistoricalDifferenceCompletion',
    tableName: 'transfer_historical_difference_completions',
  });

  return TransferHistoricalDifferenceCompletion;
};


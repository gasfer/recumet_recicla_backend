'use strict';
const { Model } = require('sequelize');
const { formattedDecimalQuantitySetter } = require('../helpers/number-formatter');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewInventoryHold extends Model {
    static associate(models) {
      TransferReviewInventoryHold.belongsTo(models.TransferReviewNoteDetail, { as: 'reviewDetail', foreignKey: 'id_transfer_review_note_detail' });
      TransferReviewInventoryHold.belongsTo(models.Product, { as: 'product', foreignKey: 'id_product' });
      TransferReviewInventoryHold.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      TransferReviewInventoryHold.belongsTo(models.Storage, { as: 'storage', foreignKey: 'id_storage' });
      TransferReviewInventoryHold.belongsTo(models.User, { as: 'createdUser', foreignKey: 'id_created_user' });
    }
  }

  TransferReviewInventoryHold.init({
    quantity: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      validate: { min: 0.0001 },
      set(value) { this.setDataValue('quantity', formattedDecimalQuantitySetter(value)); },
    },
    disposition: {
      type: DataTypes.ENUM('EN_REVISION', 'RETENIDO_SIN_AJUSTE', 'LIBERADO_POR_AJUSTE'),
      allowNull: false,
      defaultValue: 'EN_REVISION',
    },
    id_transfer_review_note_detail: { type: DataTypes.INTEGER, allowNull: false },
    id_product: { type: DataTypes.INTEGER, allowNull: false },
    id_sucursal: { type: DataTypes.INTEGER, allowNull: false },
    id_storage: { type: DataTypes.INTEGER, allowNull: false },
    id_created_user: { type: DataTypes.INTEGER, allowNull: false },
  }, {
    sequelize,
    modelName: 'TransferReviewInventoryHold',
    tableName: 'transfer_review_inventory_holds',
    indexes: [{
      name: 'transfer_review_inventory_holds_id_transfer_review_note_detail_',
      unique: true,
      fields: ['id_transfer_review_note_detail', 'disposition'],
    }],
  });
  return TransferReviewInventoryHold;
};

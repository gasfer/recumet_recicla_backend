'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransferReviewNote extends Model {
    static associate(models) {
      TransferReviewNote.belongsTo(models.Transfers, { as: 'transfer', foreignKey: 'id_transfer' });
      TransferReviewNote.belongsTo(models.kardexMovements, { as: 'kardexMovement', foreignKey: 'id_kardex_movement' });
      TransferReviewNote.belongsTo(models.Product, { as: 'registeredProduct', foreignKey: 'id_product' });
      TransferReviewNote.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      TransferReviewNote.belongsTo(models.Sucursal, { as: 'sucursal', foreignKey: 'id_sucursal' });
      TransferReviewNote.belongsTo(models.Storage, { as: 'storage', foreignKey: 'id_storage' });
      TransferReviewNote.hasMany(models.TransferReviewNoteDetail, { as: 'details', foreignKey: 'id_transfer_review_note' });
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
    id_storage: DataTypes.INTEGER
  }, { sequelize, modelName: 'TransferReviewNote', tableName: 'transfer_review_notes' });
  return TransferReviewNote;
};

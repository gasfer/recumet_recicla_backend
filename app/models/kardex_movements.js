'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter, formattedDecimalQuantitySetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class kardexMovements extends Model {
    static associate(models) {
      kardexMovements.hasOne(models.TransferReviewNote, { as: 'transferReviewNote', foreignKey: 'id_kardex_movement' });
    }
  }
  kardexMovements.init({
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    details: DataTypes.STRING,
    quantity: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity', formattedDecimalQuantitySetter(value));
      }
    },
    cost: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost', formattedDecimalSetter(value));
      }
    },
    price: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('price', formattedDecimalSetter(value));
      }
    },
    total: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('total', formattedDecimalSetter(value));
      }
    },
    id_product: DataTypes.INTEGER,
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    registry_number: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'kardexMovements',
    tableName: 'kardex_movements'
  });
  return kardexMovements;
};

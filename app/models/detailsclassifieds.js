'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalQuantitySetter, formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class DetailsClassified extends Model {
    static associate(models) {
      DetailsClassified.belongsTo(models.Classified,{as: 'classified', foreignKey:'id_classified'});
      DetailsClassified.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsClassified.init({
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
    id_classified: DataTypes.INTEGER,
    id_product: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'DetailsClassified',
    tableName: 'details_classifieds'
  });
  return DetailsClassified;
};
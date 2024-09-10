'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DetailsClassified extends Model {
    static associate(models) {
      DetailsClassified.belongsTo(models.Classified,{as: 'classified', foreignKey:'id_classified'});
      DetailsClassified.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
    }
  }
  DetailsClassified.init({
    quantity: DataTypes.DECIMAL,
    cost: DataTypes.DECIMAL,
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
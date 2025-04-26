'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter, formattedDecimalQuantitySetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class Classified extends Model {
    static associate(models) {
      Classified.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      Classified.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
      Classified.belongsTo(models.Scale,{as: 'scale', foreignKey:'id_scale'});
      Classified.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
      Classified.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Classified.hasMany(models.DetailsClassified,{as: 'detailsClassified', foreignKey:'id_classified'});
    }
  }
  Classified.init({
    cod: DataTypes.STRING,
    date_classified: DataTypes.DATE,
    type_registry: DataTypes.STRING,
    number_registry: DataTypes.STRING,
    id_user: DataTypes.INTEGER,
    comments: DataTypes.TEXT,
    id_product: DataTypes.INTEGER,
    cost_product: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_product', formattedDecimalSetter(value));
      }
    },
    quantity_product: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity_product', formattedDecimalQuantitySetter(value));
      }
    },
    id_scale: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'Classified',
    tableName: 'classifieds'
  });
  return Classified;
};
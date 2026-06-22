'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Category extends Model {
    static associate(models) {
      Category.hasMany(models.Product, { as: 'product', foreignKey: 'id_category' });
      Category.hasMany(models.Provider, { as: 'provider', foreignKey: 'id_category' });
    }
  }
  Category.init({
    name: DataTypes.STRING,
    description: DataTypes.TEXT,
    type: {
      type: DataTypes.ENUM('RAW_MATERIAL', 'FINISHED_PRODUCT', 'RESALE_ITEM'),
      allowNull: false
    },
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Category',
    tableName: 'categories'
  });
  return Category;
};
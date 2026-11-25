'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjExpenseCategory extends Model {
    static associate(models) { CjExpenseCategory.hasMany(models.CjExpense, { as: 'expenses', foreignKey: 'id_categoria' }); }
  }
  CjExpenseCategory.init({ name: DataTypes.STRING, description: DataTypes.STRING, cashbox_type: DataTypes.STRING, is_active: DataTypes.BOOLEAN }, { sequelize, modelName: 'CjExpenseCategory', tableName: 'cj_categoria_gasto' });
  return CjExpenseCategory;
};

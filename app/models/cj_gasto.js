'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjExpense extends Model {
    static associate(models) {
      CjExpense.belongsTo(models.CajaSmall, { as: 'session', foreignKey: 'id_caja_small' });
      CjExpense.belongsTo(models.CjAccount, { as: 'account', foreignKey: 'id_cuenta' });
      CjExpense.belongsTo(models.CjExpenseCategory, { as: 'category', foreignKey: 'id_categoria' });
      CjExpense.belongsTo(models.DetailsCajaSmall, { as: 'movement', foreignKey: 'id_detail_caja_small' });
      CjExpense.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
      CjExpense.hasMany(models.CjExpenseAttachment, { as: 'attachments', foreignKey: 'id_gasto' });
    }
  }
  CjExpense.init({ id_caja_small: DataTypes.INTEGER, id_cuenta: DataTypes.INTEGER, id_categoria: DataTypes.INTEGER, id_detail_caja_small: DataTypes.INTEGER, description: DataTypes.STRING, amount: DataTypes.DECIMAL, currency: DataTypes.STRING, id_user: DataTypes.INTEGER, register_type: DataTypes.STRING, expense_date: DataTypes.DATE, responsible: DataTypes.STRING, concept: DataTypes.STRING, provider_name: DataTypes.STRING, provider_tax_id: DataTypes.STRING, receipt_type: DataTypes.STRING, receipt_number: DataTypes.STRING, receipt_date: DataTypes.DATEONLY, expense_details: DataTypes.JSONB }, { sequelize, modelName: 'CjExpense', tableName: 'cj_gastos' });
  return CjExpense;
};

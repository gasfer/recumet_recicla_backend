'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class CjExpenseAttachment extends Model {
    static associate(models) {
      CjExpenseAttachment.belongsTo(models.CjExpense, { as: 'expense', foreignKey: 'id_gasto' });
      CjExpenseAttachment.belongsTo(models.User, { as: 'user', foreignKey: 'uploaded_by' });
    }
  }
  CjExpenseAttachment.init({ id_gasto: DataTypes.INTEGER, file_name: DataTypes.STRING, file_path: DataTypes.STRING, mime_type: DataTypes.STRING, file_size: DataTypes.BIGINT, uploaded_by: DataTypes.INTEGER }, { sequelize, modelName: 'CjExpenseAttachment', tableName: 'cj_gastos_adjuntos' });
  return CjExpenseAttachment;
};

'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { as: 'user', foreignKey: 'id_user' });
    }
  }
  Notification.init({
    id_user: DataTypes.INTEGER,
    title: DataTypes.STRING,
    message: DataTypes.TEXT,
    type: DataTypes.STRING,
    level: DataTypes.STRING,
    id_reference: DataTypes.INTEGER,
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications'
  });
  return Notification;
};

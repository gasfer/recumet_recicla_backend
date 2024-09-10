'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.assignPermission,{as: 'assign_permission', foreignKey:'id_user'});
      User.hasMany(models.assignShift,{as: 'assign_shift', foreignKey:'id_user'});
      User.hasMany(models.assignSucursales,{as: 'assign_sucursales', foreignKey:'id_user'});
      User.hasMany(models.History,{as: 'history', foreignKey:'id_user'});
      User.hasMany(models.Input,{as: 'inputs', foreignKey:'id_user'});
      User.hasMany(models.Output,{as: 'outputs', foreignKey:'id_user'});
      User.hasMany(models.AbonosAccountsPayable,{as: 'abonosAccountsPayable', foreignKey:'id_user'});
      User.hasMany(models.AbonosAccountsReceivable,{as: 'abonosAccountsReceivable', foreignKey:'id_user'});
      User.hasMany(models.Classified,{as: 'classified', foreignKey:'id_user'});
      User.hasMany(models.CajaSmall,{as: 'cajaSmall', foreignKey:'id_user'});
      User.hasMany(models.Transfers,{as: 'transfers_send', foreignKey:'id_user_send'});
      User.hasMany(models.Transfers,{as: 'transfers_received', foreignKey:'id_user_received'});
    }
  }
  User.init({
    full_names: DataTypes.STRING,
    number_document: DataTypes.STRING,
    cellphone: DataTypes.INTEGER,
    sex: DataTypes.STRING,
    photo: DataTypes.STRING,
    position: DataTypes.STRING,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    role: DataTypes.STRING,
    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users'
  });
  return User;
};
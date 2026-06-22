'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter } = require('../helpers/number-formatter');
module.exports = (sequelize, DataTypes) => {
  class CajaSmall extends Model {
    static associate(models) {
      CajaSmall.hasMany(models.DetailsCajaSmall,{as: 'detailsCajaSmall', foreignKey:'id_caja_small'});
      CajaSmall.belongsTo(models.User,{as: 'user', foreignKey:'id_user'});
      CajaSmall.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
    }
  }
  CajaSmall.init({
    date_apertura: DataTypes.DATE,
    monto_apertura: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_apertura', formattedDecimalSetter(value));
      }
    },
    monto_cierre: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('monto_cierre', formattedDecimalSetter(value));
      }
    },
    date_cierre: DataTypes.DATE,
    id_user: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    status: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'CajaSmall',
    tableName: 'caja_smalls'
  });
  return CajaSmall;
};
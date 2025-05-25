'use strict';
const {
  Model
} = require('sequelize');
const { formattedDecimalSetter, formattedDecimalQuantitySetter } = require('../helpers/number-formatter');
//TODO!: UNA VEZ MIGRADO LOS MOVIMIENTOS INICIALES, ELIMINAR ESTE MODELO
module.exports = (sequelize, DataTypes) => {
  class Kardex extends Model {
    static associate(models) {
      Kardex.belongsTo(models.Product,{as: 'product', foreignKey:'id_product'});
      Kardex.belongsTo(models.Product,{as: 'productClassified', foreignKey:'id_product_classified'});
      Kardex.belongsTo(models.Input,{as: 'input', foreignKey:'id_input'});
      Kardex.belongsTo(models.Provider,{as: 'provider', foreignKey:'id_provider'});
      Kardex.belongsTo(models.Client,{as: 'client', foreignKey:'id_client'});
      Kardex.belongsTo(models.Output,{as: 'output', foreignKey:'id_output'});
      Kardex.belongsTo(models.Sucursal,{as: 'sucursal', foreignKey:'id_sucursal'});
      Kardex.belongsTo(models.Sucursal,{as: 'sucursalOriginDestination', foreignKey:'id_sucursal_origin_destination'});
      Kardex.belongsTo(models.Storage,{as: 'storage', foreignKey:'id_storage'});
    }
  }
  Kardex.init({
    type: DataTypes.STRING,
    date: DataTypes.DATE,
    detalle: DataTypes.TEXT,
    document: DataTypes.STRING,

    quantity_inicial: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity_inicial', formattedDecimalQuantitySetter(value));
      }
    },
    price_u_inicial: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('price_u_inicial', formattedDecimalSetter(value));
      }
    },
    cost_u_inicial: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_u_inicial', formattedDecimalSetter(value));
      }
    },
    cost_total_inicial: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_total_inicial', formattedDecimalSetter(value));
      }
    },

    quantity_input: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity_input', formattedDecimalQuantitySetter(value));
      }
    },
    cost_u_input: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_u_input', formattedDecimalSetter(value));
      }
    },
    cost_total_input: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_total_input', formattedDecimalSetter(value));
      }
    },
    
    quantity_output: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity_output', formattedDecimalQuantitySetter(value));
      }
    },
    cost_u_output: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_u_output', formattedDecimalSetter(value));
      }
    },
    cost_total_output: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_total_output', formattedDecimalSetter(value));
      }
    },

    quantity_saldo: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('quantity_saldo', formattedDecimalQuantitySetter(value));
      }
    },
    cost_u_saldo: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_u_saldo', formattedDecimalSetter(value));
      }
    },
    cost_total_saldo: {
      type: DataTypes.DECIMAL,
      set(value) {
        this.setDataValue('cost_total_saldo', formattedDecimalSetter(value));
      }
    },

    id_product: DataTypes.INTEGER,
    id_product_classified: DataTypes.INTEGER,
    id_sucursal_origin_destination: DataTypes.INTEGER,
    id_input: DataTypes.INTEGER,
    id_provider: DataTypes.INTEGER,
    id_client: DataTypes.INTEGER,
    id_output: DataTypes.INTEGER,
    id_sucursal: DataTypes.INTEGER,
    id_storage: DataTypes.INTEGER,

    status: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'Kardex',
    tableName: 'kardexes'
  });
  return Kardex;
};
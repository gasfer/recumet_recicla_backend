'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => {
      return Promise.all([
        queryInterface.addColumn('kardexes', 'price_u_inicial', {
          type: Sequelize.DataTypes.DECIMAL,
        }, { transaction: t }),
        queryInterface.addColumn('kardexes', 'id_client', {
          type: Sequelize.INTEGER,
          references: {
            model: 'clients',
            key: 'id'
          },
        }, { transaction: t }),
        queryInterface.addColumn('kardexes', 'id_product_classified', {
          type: Sequelize.INTEGER,
          references: {
            model: 'products',
            key: 'id'
          },
        }, { transaction: t }),
        queryInterface.addColumn('kardexes', 'id_sucursal_origin_destination', {
          type: Sequelize.INTEGER,
          references: {
            model: 'sucursals',
            key: 'id'
          },
        }, { transaction: t }),
      ]);
    });
  },
  async down(queryInterface, Sequelize) {
    return queryInterface.sequelize.transaction(t => {
      return Promise.all([
        queryInterface.removeColumn('kardexes', 'id_product_classified', { transaction: t }),
        queryInterface.removeColumn('kardexes', 'price_u_inicial', { transaction: t }),
        queryInterface.removeColumn('kardexes', 'id_client', { transaction: t }),
        queryInterface.removeColumn('kardexes', 'id_sucursal_origin_destination', { transaction: t })
      ]);
    });
  }
};
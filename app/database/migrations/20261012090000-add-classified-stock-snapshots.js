'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('classifieds', 'stock_before', {
      type: Sequelize.DECIMAL,
      allowNull: true,
    });
    await queryInterface.addColumn('classifieds', 'stock_after', {
      type: Sequelize.DECIMAL,
      allowNull: true,
    });
    await queryInterface.addColumn('details_classifieds', 'stock_before', {
      type: Sequelize.DECIMAL,
      allowNull: true,
    });
    await queryInterface.addColumn('details_classifieds', 'stock_after', {
      type: Sequelize.DECIMAL,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('details_classifieds', 'stock_after');
    await queryInterface.removeColumn('details_classifieds', 'stock_before');
    await queryInterface.removeColumn('classifieds', 'stock_after');
    await queryInterface.removeColumn('classifieds', 'stock_before');
  },
};

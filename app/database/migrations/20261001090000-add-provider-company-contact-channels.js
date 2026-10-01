'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_companies', 'corporate_phone', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('provider_companies', 'corporate_cellphone', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('provider_companies', 'corporate_email', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('provider_companies', 'website', { type: Sequelize.STRING, allowNull: true });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('provider_companies', 'website');
    await queryInterface.removeColumn('provider_companies', 'corporate_email');
    await queryInterface.removeColumn('provider_companies', 'corporate_cellphone');
    await queryInterface.removeColumn('provider_companies', 'corporate_phone');
  },
};

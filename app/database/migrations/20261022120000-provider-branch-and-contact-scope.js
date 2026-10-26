'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('providers', 'enabled_sucursal_ids', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('providers', 'operating_departments', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('providers', 'has_branches', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('provider_companies', 'operating_departments', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('provider_contacts', 'department', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('provider_contacts', 'comments', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('provider_contacts', 'comments');
    await queryInterface.removeColumn('provider_contacts', 'department');
    await queryInterface.removeColumn('provider_companies', 'operating_departments');
    await queryInterface.removeColumn('providers', 'operating_departments');
    await queryInterface.removeColumn('providers', 'has_branches');
    await queryInterface.removeColumn('providers', 'enabled_sucursal_ids');
  },
};

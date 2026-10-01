'use strict';

const INDEX = 'provider_materials_active_provider_product_unique';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('provider_companies', 'operational_type', {
      type: Sequelize.ENUM('RAW_MATERIAL', 'SERVICES', 'SUPPLIES', 'EQUIPMENT_ASSETS', 'COMMERCIAL', 'OTHER'),
      allowNull: false,
      defaultValue: 'RAW_MATERIAL',
    });
    await queryInterface.addColumn('provider_materials', 'frequency', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('provider_materials', 'service_mode', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addIndex('provider_materials', ['id_provider', 'id_product'], {
      name: INDEX, unique: true, where: { status: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('provider_materials', INDEX);
    await queryInterface.removeColumn('provider_materials', 'service_mode');
    await queryInterface.removeColumn('provider_materials', 'frequency');
    await queryInterface.removeColumn('provider_companies', 'operational_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_provider_companies_operational_type";');
  },
};

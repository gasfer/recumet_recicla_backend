'use strict';

const PROFILE_COLUMNS = {
  commercialized_materials: 1000,
  contact_frequency: 255,
  usual_service_mode: 255,
  logistics_condition: 255,
  negotiation_mode: 255,
  price_policy: 255,
  habitual_price_adjustment: 500,
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async transaction => {
      for (const [name, length] of Object.entries(PROFILE_COLUMNS)) {
        await queryInterface.addColumn('providers', name, { type: Sequelize.STRING(length), allowNull: true }, { transaction });
      }
      await queryInterface.addColumn('provider_materials', 'estimated_volume', { type: Sequelize.DECIMAL(18, 3), allowNull: true }, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.removeColumn('provider_materials', 'estimated_volume', { transaction });
      for (const name of Object.keys(PROFILE_COLUMNS)) {
        await queryInterface.removeColumn('providers', name, { transaction });
      }
    });
  },
};

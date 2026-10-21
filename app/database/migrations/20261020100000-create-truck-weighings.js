'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('truck_weighings', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      ticket: { type: Sequelize.STRING, allowNull: false, unique: true },
      registered_at: { type: Sequelize.DATE, allowNull: false },
      first_weight: { type: Sequelize.DECIMAL(14, 3), allowNull: false },
      second_weight: { type: Sequelize.DECIMAL(14, 3), allowNull: true },
      tare: { type: Sequelize.DECIMAL(14, 3), allowNull: true },
      gross: { type: Sequelize.DECIMAL(14, 3), allowNull: true },
      net: { type: Sequelize.DECIMAL(14, 3), allowNull: true },
      ing_sal: { type: Sequelize.STRING(16), allowNull: true },
      first_time: { type: Sequelize.STRING(16), allowNull: false },
      second_time: { type: Sequelize.STRING(16), allowNull: true },
      state: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PRIMER_PESO' },
      details: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addIndex('truck_weighings', ['state', 'registered_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('truck_weighings');
  },
};

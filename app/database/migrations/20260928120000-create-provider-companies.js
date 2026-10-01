'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_companies', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      full_names: { allowNull: false, type: Sequelize.STRING },
      number_document: { allowNull: false, type: Sequelize.STRING, unique: true },
      commercial_name: Sequelize.STRING,
      entity_type: Sequelize.STRING,
      id_type_provider: Sequelize.INTEGER,
      origin_channel: Sequelize.STRING,
      relationship_status: Sequelize.STRING,
      negotiation_condition: Sequelize.TEXT,
      commercial_observations: Sequelize.TEXT,
      requires_certificate: Sequelize.BOOLEAN,
      requires_traceability_report: Sequelize.BOOLEAN,
      general_observations: Sequelize.TEXT,
      has_branches: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: false },
      status: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { allowNull: false, type: Sequelize.DATE }, updatedAt: { allowNull: false, type: Sequelize.DATE },
    });
    await queryInterface.addColumn('providers', 'id_provider_company', {
      type: Sequelize.INTEGER, allowNull: true,
      references: { model: 'provider_companies', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('providers', ['id_provider_company']);
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('providers', ['id_provider_company']);
    await queryInterface.removeColumn('providers', 'id_provider_company');
    await queryInterface.dropTable('provider_companies');
  },
};

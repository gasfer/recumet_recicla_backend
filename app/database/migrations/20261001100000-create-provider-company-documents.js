'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_company_documents', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_provider_company: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'provider_companies', key: 'id' }, onDelete: 'CASCADE' },
      document_type: { type: Sequelize.STRING(40), allowNull: false },
      original_name: { type: Sequelize.STRING(255), allowNull: false },
      stored_name: { type: Sequelize.STRING(255), allowNull: false },
      mime_type: { type: Sequelize.STRING(100), allowNull: false },
      size_bytes: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('provider_company_documents', ['id_provider_company', 'document_type'], { name: 'provider_company_documents_company_type_idx' });
  },
  async down(queryInterface) { await queryInterface.dropTable('provider_company_documents'); },
};

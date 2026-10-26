'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('provider_company_documents', ['id_provider_company', 'document_type'], {
      name: 'provider_company_documents_one_active_type_idx',
      unique: true,
      where: { status: true },
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('provider_company_documents', 'provider_company_documents_one_active_type_idx');
  },
};

'use strict';

const INDEXES = Object.freeze({
  headquarters: 'providers_one_active_headquarters_per_company',
  mainBranch: 'provider_branches_one_active_main_per_provider',
  mainContact: 'provider_contacts_one_active_main_per_provider',
  mainAccount: 'provider_bank_accounts_one_active_main_per_provider',
  bankAccount: 'provider_bank_accounts_active_number_unique',
  materialCategory: 'provider_materials_active_category_unique',
  materialProduct: 'provider_materials_active_product_unique',
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('providers', 'site_role', {
      type: Sequelize.ENUM('HEADQUARTERS', 'BRANCH'),
      allowNull: true,
    });

    await queryInterface.addColumn('provider_companies', 'id_commercial_user', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('providers', ['id_provider_company'], {
      name: INDEXES.headquarters,
      unique: true,
      where: { site_role: 'HEADQUARTERS', status: true },
    });
    await queryInterface.addIndex('provider_branches', ['id_provider'], {
      name: INDEXES.mainBranch,
      unique: true,
      where: { is_main: true, status: true },
    });
    await queryInterface.addIndex('provider_contacts', ['id_provider'], {
      name: INDEXES.mainContact,
      unique: true,
      where: { is_main_contact: true, status: true },
    });
    await queryInterface.addIndex('provider_bank_accounts', ['id_provider'], {
      name: INDEXES.mainAccount,
      unique: true,
      where: { is_main: true, status: true },
    });
    await queryInterface.addIndex('provider_bank_accounts', ['id_provider', 'id_bank', 'account_number'], {
      name: INDEXES.bankAccount,
      unique: true,
      where: { status: true },
    });
    await queryInterface.addIndex('provider_materials', ['id_provider', 'id_category'], {
      name: INDEXES.materialCategory,
      unique: true,
      where: { id_product: null, status: true },
    });
    await queryInterface.addIndex('provider_materials', ['id_provider', 'id_category', 'id_product'], {
      name: INDEXES.materialProduct,
      unique: true,
      where: { status: true },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('provider_materials', INDEXES.materialProduct);
    await queryInterface.removeIndex('provider_materials', INDEXES.materialCategory);
    await queryInterface.removeIndex('provider_bank_accounts', INDEXES.bankAccount);
    await queryInterface.removeIndex('provider_bank_accounts', INDEXES.mainAccount);
    await queryInterface.removeIndex('provider_contacts', INDEXES.mainContact);
    await queryInterface.removeIndex('provider_branches', INDEXES.mainBranch);
    await queryInterface.removeIndex('providers', INDEXES.headquarters);
    await queryInterface.removeColumn('provider_companies', 'id_commercial_user');
    await queryInterface.removeColumn('providers', 'site_role');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_providers_site_role";');
  },
};

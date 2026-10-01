'use strict';

const timestamps = (Sequelize) => ({
  createdAt: { allowNull: false, type: Sequelize.DATE },
  updatedAt: { allowNull: false, type: Sequelize.DATE },
});

const providerReference = {
  type: 'INTEGER',
  allowNull: false,
  references: { model: 'providers', key: 'id' },
  onUpdate: 'CASCADE',
  onDelete: 'CASCADE',
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_branches', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_provider: { ...providerReference, type: Sequelize.INTEGER },
      branch_name: { type: Sequelize.STRING, allowNull: false },
      department: Sequelize.STRING,
      city: Sequelize.STRING,
      zone: Sequelize.STRING,
      address: Sequelize.STRING,
      is_main: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize),
    });
    await queryInterface.createTable('provider_contacts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_provider: { ...providerReference, type: Sequelize.INTEGER },
      full_name: { type: Sequelize.STRING, allowNull: false },
      position_area: Sequelize.STRING,
      cellphone: Sequelize.STRING,
      email: Sequelize.STRING,
      is_main_contact: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize),
    });
    await queryInterface.createTable('provider_bank_accounts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_provider: { ...providerReference, type: Sequelize.INTEGER },
      id_bank: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'banks', key: 'id' } },
      account_holder: { type: Sequelize.STRING, allowNull: false },
      account_number: { type: Sequelize.STRING, allowNull: false },
      account_type: { type: Sequelize.ENUM('CAJA_AHORRO', 'CUENTA_CORRIENTE', 'OTRA'), allowNull: false },
      currency: { type: Sequelize.ENUM('BOB', 'USD'), allowNull: false, defaultValue: 'BOB' },
      is_main: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize),
    });
    await queryInterface.createTable('provider_materials', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_provider: { ...providerReference, type: Sequelize.INTEGER },
      id_category: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'categories', key: 'id' } },
      id_product: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'products', key: 'id' } },
      status: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ...timestamps(Sequelize),
    });

    await Promise.all([
      queryInterface.addIndex('provider_branches', ['id_provider', 'status']),
      queryInterface.addIndex('provider_contacts', ['id_provider', 'status']),
      queryInterface.addIndex('provider_bank_accounts', ['id_provider', 'status']),
      queryInterface.addIndex('provider_materials', ['id_provider', 'id_category', 'id_product']),
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('provider_materials');
    await queryInterface.dropTable('provider_bank_accounts');
    await queryInterface.dropTable('provider_contacts');
    await queryInterface.dropTable('provider_branches');
  },
};

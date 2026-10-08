'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('provider_registration_drafts', {
      user_id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      draft_key: { type: Sequelize.STRING(80), primaryKey: true, allowNull: false },
      form_values: { type: Sequelize.JSONB, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
  },
  async down(queryInterface) { await queryInterface.dropTable('provider_registration_drafts'); },
};

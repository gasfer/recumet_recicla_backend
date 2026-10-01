'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('providers', {
      fields: ['id_commercial_user'],
      type: 'foreign key',
      name: 'providers_commercial_user_fkey',
      references: { table: 'users', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('providers', ['id_commercial_user'], { name: 'providers_commercial_user_idx' });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('providers', 'providers_commercial_user_idx');
    await queryInterface.removeConstraint('providers', 'providers_commercial_user_fkey');
  },
};

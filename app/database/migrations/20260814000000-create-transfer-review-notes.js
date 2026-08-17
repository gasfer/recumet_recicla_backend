'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transfer_review_notes', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      registry_number: { allowNull: false, type: Sequelize.STRING, unique: true },
      type: { allowNull: false, type: Sequelize.ENUM('FALTANTE_PARA_REVISION', 'EXCEDENTE_PARA_REVISION') },
      date: { allowNull: false, type: Sequelize.DATE },
      observations: { type: Sequelize.TEXT },
      id_transfer: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_kardex_movement: { allowNull: false, type: Sequelize.INTEGER, unique: true, references: { model: 'kardex_movements', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_product: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_user: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_sucursal: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'sucursals', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      id_storage: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'storages', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.createTable('transfer_review_note_details', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      quantity_sent: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      quantity_received: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      quantity_difference: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      id_transfer_review_note: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'transfer_review_notes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      id_detail_transfer: { type: Sequelize.INTEGER, references: { model: 'details_transfers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      id_product: { allowNull: false, type: Sequelize.INTEGER, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });
    await queryInterface.addIndex('transfer_review_note_details', ['id_transfer_review_note']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transfer_review_note_details');
    await queryInterface.dropTable('transfer_review_notes');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transfer_review_notes_type";');
  }
};

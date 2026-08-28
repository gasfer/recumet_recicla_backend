'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableName = 'transfer_review_inventory_holds';
    const detailDispositionIndex = 'transfer_review_inventory_holds_id_transfer_review_note_detail_';
    const availabilityIndex = 'transfer_review_inventory_holds_availability_idx';
    const positiveQuantityConstraint = 'transfer_review_inventory_holds_positive_quantity';
    const existingTables = await queryInterface.showAllTables();
    const tableExists = existingTables.some((table) => (
      (typeof table === 'string' ? table : table.tableName) === tableName
    ));

    if (!tableExists) await queryInterface.createTable(tableName, {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      quantity: { allowNull: false, type: Sequelize.DECIMAL(14, 4) },
      disposition: {
        allowNull: false,
        type: Sequelize.ENUM('EN_REVISION', 'RETENIDO_SIN_AJUSTE', 'LIBERADO_POR_AJUSTE'),
        defaultValue: 'EN_REVISION',
      },
      id_transfer_review_note_detail: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'transfer_review_note_details', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_product: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_sucursal: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'sucursals', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_storage: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'storages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      id_created_user: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.changeColumn(tableName, 'quantity', {
      allowNull: false,
      type: Sequelize.DECIMAL(14, 4),
    });

    const constraints = await queryInterface.showConstraint(tableName);
    if (!constraints.some(({ constraintName }) => constraintName === positiveQuantityConstraint)) {
      await queryInterface.addConstraint(tableName, {
        fields: ['quantity'],
        type: 'check',
        where: { quantity: { [Sequelize.Op.gt]: 0 } },
        name: positiveQuantityConstraint,
      });
    }

    const indexes = await queryInterface.showIndex(tableName);
    if (!indexes.some(({ name }) => name === detailDispositionIndex)) {
      await queryInterface.addIndex(tableName, ['id_transfer_review_note_detail', 'disposition'], {
        unique: true,
        name: detailDispositionIndex,
      });
    }
    if (!indexes.some(({ name }) => name === availabilityIndex)) {
      await queryInterface.addIndex(tableName, ['id_product', 'id_sucursal', 'id_storage', 'disposition'], {
        name: availabilityIndex,
      });
    }

    await queryInterface.sequelize.query(`
      INSERT INTO transfer_review_inventory_holds (
        quantity,
        disposition,
        id_transfer_review_note_detail,
        id_product,
        id_sucursal,
        id_storage,
        id_created_user,
        "createdAt",
        "updatedAt"
      )
      SELECT
        d.quantity_difference - COALESCE(d.quantity_resolved, 0),
        'EN_REVISION',
        d.id,
        n.id_product,
        n.id_sucursal,
        n.id_storage,
        n.id_user,
        NOW(),
        NOW()
      FROM transfer_review_note_details d
      INNER JOIN transfer_review_notes n ON n.id = d.id_transfer_review_note
      WHERE d.quantity_difference - COALESCE(d.quantity_resolved, 0) > 0
      ON CONFLICT (id_transfer_review_note_detail, disposition) DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transfer_review_inventory_holds');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_transfer_review_inventory_holds_disposition";');
  },
};

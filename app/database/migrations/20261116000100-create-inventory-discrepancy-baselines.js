'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('inventory_discrepancy_baselines', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        id_sucursal: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'sucursals', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        id_storage: {
          type: Sequelize.INTEGER,
          references: { model: 'storages', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        baseline_at: { allowNull: false, type: Sequelize.DATE },
        reason: { allowNull: false, type: Sequelize.TEXT },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX inventory_discrepancy_baselines_branch_wide_uq
        ON inventory_discrepancy_baselines (id_sucursal)
        WHERE id_storage IS NULL
      `, { transaction });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX inventory_discrepancy_baselines_location_uq
        ON inventory_discrepancy_baselines (id_sucursal, id_storage)
        WHERE id_storage IS NOT NULL
      `, { transaction });
    });
  },

  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::integer AS baseline_count FROM inventory_discrepancy_baselines',
    );
    if (Number(rows[0].baseline_count) > 0) {
      throw new Error('No se puede revertir: hay líneas base de inventario aplicadas. Retírelas mediante una reversión operativa revisada.');
    }
    await queryInterface.dropTable('inventory_discrepancy_baselines');
  },
};

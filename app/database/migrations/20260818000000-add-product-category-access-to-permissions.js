'use strict';

const UNIQUE_CONSTRAINT = 'assign_permissions_user_module_unique';
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`
        WITH merged AS (
          SELECT
            id_user,
            module,
            MAX(id) AS keep_id,
            BOOL_OR(COALESCE("view", false)) AS "view",
            BOOL_OR(COALESCE("create", false)) AS "create",
            BOOL_OR(COALESCE("update", false)) AS "update",
            BOOL_OR(COALESCE("delete", false)) AS "delete",
            BOOL_OR(COALESCE("reports", false)) AS "reports",
            BOOL_OR(COALESCE("status", false)) AS "status"
          FROM assign_permissions
          GROUP BY id_user, module
        )
        UPDATE assign_permissions AS target
        SET
          "view" = merged."view",
          "create" = merged."create",
          "update" = merged."update",
          "delete" = merged."delete",
          "reports" = merged."reports",
          "status" = merged."status"
        FROM merged
        WHERE target.id = merged.keep_id;
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM assign_permissions AS duplicate
        USING assign_permissions AS retained
        WHERE duplicate.id_user = retained.id_user
          AND duplicate.module = retained.module
          AND duplicate.id < retained.id;
      `, { transaction });

      await queryInterface.addColumn('assign_permissions', 'allowed_category_types', {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: [],
      }, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE assign_permissions AS permission
        SET allowed_category_types = CASE
          WHEN permission.module = 'COMPRAS' AND users.role = 'OPERADOR'
            THEN ARRAY['RAW_MATERIAL']::VARCHAR(255)[]
          ELSE ARRAY['RAW_MATERIAL', 'FINISHED_PRODUCT', 'RESALE_ITEM']::VARCHAR(255)[]
        END
        FROM users
        WHERE users.id = permission.id_user
          AND permission.module IN ('COMPRAS', 'VENTAS', 'TRASLADOS', 'CLASIFICADOS');
      `, {
        transaction,
      });

      await queryInterface.addConstraint('assign_permissions', {
        fields: ['id_user', 'module'],
        type: 'unique',
        name: UNIQUE_CONSTRAINT,
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeConstraint('assign_permissions', UNIQUE_CONSTRAINT, { transaction });
      await queryInterface.removeColumn('assign_permissions', 'allowed_category_types', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

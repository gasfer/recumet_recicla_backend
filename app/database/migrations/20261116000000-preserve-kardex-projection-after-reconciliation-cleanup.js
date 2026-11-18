'use strict';

const { explicitKardexFunctionSql } = require('../../helpers/reconciliation-kardex-view');

const markerFunctionSql = `CREATE OR REPLACE FUNCTION reconciliation_has_explicit_kardex(document_type text, document_id integer)
  RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT EXISTS (
      SELECT 1
      FROM kardex_movements km
      WHERE km.replaced_document_type = document_type
        AND km.replaced_document_id = document_id
        AND km.status = true
    )
  $function$;`;

const linkBasedFunctionSql = () => explicitKardexFunctionSql().replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const transaction = await sequelize.transaction();
    let stage = 'inicio';
    try {
      await sequelize.query("SET LOCAL lock_timeout = '8s'", { transaction });
      await sequelize.query("SET LOCAL statement_timeout = '180s'", { transaction });

      stage = 'agregar columnas a kardex_movements';
      console.info(`[kardex-baseline] ${stage}`);
      await queryInterface.addColumn('kardex_movements', 'replaced_document_type', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });
      await queryInterface.addColumn('kardex_movements', 'replaced_document_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      }, { transaction });

      stage = 'verificar referencias ambiguas';
      console.info(`[kardex-baseline] ${stage}`);
      await queryInterface.sequelize.query(`
        DO $migration$
        BEGIN
          IF EXISTS (
            SELECT km.id
            FROM transfer_review_action_movements link
            INNER JOIN transfer_review_resolution_actions action
              ON action.id = link.id_transfer_review_resolution_action
            INNER JOIN kardex_movements km ON km.id = link.id_kardex_movement
            WHERE action.operation_mode = 'CREATED_AUTOMATICALLY'
              AND action.operation_type IN ('TRANSFER', 'CLASSIFIED')
              AND action.operation_id IS NOT NULL
              AND link.movement_role = 'ORIGINAL'
            GROUP BY km.id
            HAVING COUNT(DISTINCT (action.operation_type, action.operation_id)) > 1
          ) THEN
            RAISE EXCEPTION 'Un movimiento Kardex está asociado a más de un documento reemplazado; no se puede migrar sin ambigüedad.';
          END IF;
        END
        $migration$;
      `, { transaction });

      stage = 'copiar referencias de documentos al Kardex';
      console.info(`[kardex-baseline] ${stage}`);
      await queryInterface.sequelize.query(`
        UPDATE kardex_movements km
        SET replaced_document_type = source.operation_type,
            replaced_document_id = source.operation_id
        FROM (
          SELECT DISTINCT link.id_kardex_movement, action.operation_type, action.operation_id
          FROM transfer_review_action_movements link
          INNER JOIN transfer_review_resolution_actions action
            ON action.id = link.id_transfer_review_resolution_action
          INNER JOIN kardex_movements linked_movement
            ON linked_movement.id = link.id_kardex_movement
          WHERE action.operation_mode = 'CREATED_AUTOMATICALLY'
            AND action.operation_type IN ('TRANSFER', 'CLASSIFIED')
            AND action.operation_id IS NOT NULL
            AND link.movement_role = 'ORIGINAL'
            AND linked_movement.status = true
        ) source
        WHERE km.id = source.id_kardex_movement
      `, { transaction });

      stage = 'crear índice de movimientos marcados';
      console.info(`[kardex-baseline] ${stage}`);
      await sequelize.query(`
        CREATE INDEX kardex_movements_replaced_document_idx
        ON kardex_movements (replaced_document_type, replaced_document_id)
        WHERE replaced_document_type IS NOT NULL AND replaced_document_id IS NOT NULL
      `, { transaction });

      stage = 'actualizar función de proyección Kardex';
      console.info(`[kardex-baseline] ${stage}`);
      await queryInterface.sequelize.query(markerFunctionSql, { transaction });
      await transaction.commit();
      console.info('[kardex-baseline] Migración completada.');
    } catch (error) {
      await transaction.rollback();
      const databaseError = error.original || error.parent || error;
      if (databaseError.code === '55P03' || /lock timeout/i.test(databaseError.message || '')) {
        throw new Error(
          `La migración de línea base no obtuvo acceso a la tabla durante la etapa «${stage}». ` +
          'Detenga temporalmente las instancias del backend y las operaciones de inventario, confirme que no haya otra migración en curso y vuelva a ejecutarla.',
          { cause: error },
        );
      }
      if (databaseError.code === '57014' || /statement timeout|canceling statement/i.test(databaseError.message || '')) {
        throw new Error(
          `La migración de línea base superó el límite de 180 segundos durante la etapa «${stage}». ` +
          'La transacción fue revertida; revise el tamaño de Kardex y vuelva a ejecutarla en una ventana de mantenimiento.',
          { cause: error },
        );
      }
      throw error;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(`
        SELECT COUNT(*)::integer AS missing_links
        FROM kardex_movements km
        WHERE km.replaced_document_type IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM transfer_review_action_movements link
            INNER JOIN transfer_review_resolution_actions action
              ON action.id = link.id_transfer_review_resolution_action
            WHERE link.id_kardex_movement = km.id
              AND link.movement_role = 'ORIGINAL'
              AND action.operation_mode = 'CREATED_AUTOMATICALLY'
              AND action.operation_type = km.replaced_document_type
              AND action.operation_id = km.replaced_document_id
          )
      `, { transaction });
      if (Number(rows[0].missing_links) > 0) {
        throw new Error('No se puede revertir esta migración después de retirar enlaces de conciliación: la vista Kardex perdería las referencias sustitutas.');
      }

      await queryInterface.sequelize.query(linkBasedFunctionSql(), { transaction });
      await queryInterface.removeIndex('kardex_movements', 'kardex_movements_replaced_document_idx', { transaction });
      await queryInterface.removeColumn('kardex_movements', 'replaced_document_id', { transaction });
      await queryInterface.removeColumn('kardex_movements', 'replaced_document_type', { transaction });
    });
  },
};

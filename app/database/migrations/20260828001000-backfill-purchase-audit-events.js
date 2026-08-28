'use strict';

const BATCH_SIZE = 500;

const correlationExpression = `
  (substr(md5('purchase-history-' || h.id), 1, 8) || '-' ||
   substr(md5('purchase-history-' || h.id), 9, 4) || '-4' ||
   substr(md5('purchase-history-' || h.id), 14, 3) || '-a' ||
   substr(md5('purchase-history-' || h.id), 18, 3) || '-' ||
   substr(md5('purchase-history-' || h.id), 21, 12))::uuid
`;

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const [resumeRows] = await sequelize.query(`
      SELECT COALESCE(MAX(split_part(idempotency_key, ':', 2)::bigint), 0) AS last_history_id
      FROM purchase_audit_events
      WHERE idempotency_key ~ '^legacy-history:[0-9]+$'
    `);
    let lastHistoryId = Number(resumeRows[0].last_history_id);
    let processed = 0;

    console.info(
      `[purchase-audit-backfill] Iniciando desde history id ${lastHistoryId}, ` +
      `en lotes de ${BATCH_SIZE}.`,
    );

    // Each batch commits independently. The idempotency key makes this migration
    // safe to resume if the process is interrupted after one or more batches.
    while (true) {
      const [rows] = await sequelize.query(`
        SELECT h.id
        FROM histories h
        JOIN inputs i ON i.id = h.id_reference
        WHERE h.module = 'INPUT'
          AND h.id > :lastHistoryId
        ORDER BY h.id ASC
        LIMIT :batchSize
      `, { replacements: { lastHistoryId, batchSize: BATCH_SIZE } });

      if (rows.length === 0) break;

      const upperHistoryId = Number(rows[rows.length - 1].id);
      const transaction = await sequelize.transaction();
      try {
        await sequelize.query("SET LOCAL lock_timeout = '8s'", { transaction });
        await sequelize.query("SET LOCAL statement_timeout = '60s'", { transaction });
        await sequelize.query(`
          INSERT INTO purchase_audit_events (
            id_input, id_sucursal, id_actor_user, entity_type, entity_id,
            event_type, reason, correlation_id, idempotency_key, historical_incomplete,
            "createdAt", "updatedAt"
          )
          SELECT i.id, h.id_sucursal, h.id_user, 'PURCHASE', i.id,
            CASE h.action
              WHEN 'CREATE' THEN 'PURCHASE_CREATED'
              WHEN 'UPDATE' THEN 'PURCHASE_UPDATED'
              WHEN 'DELETE' THEN 'PURCHASE_VOIDED'
              ELSE 'LEGACY_HISTORY'
            END,
            h.description,
            ${correlationExpression},
            'legacy-history:' || h.id, TRUE,
            h."createdAt", h."createdAt"
          FROM histories h
          JOIN inputs i ON i.id = h.id_reference
          WHERE h.module = 'INPUT'
            AND h.id > :lastHistoryId
            AND h.id <= :upperHistoryId
          ON CONFLICT (idempotency_key) DO NOTHING
        `, { replacements: { lastHistoryId, upperHistoryId }, transaction });
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        const databaseError = error.original || error.parent || error;
        if (databaseError.code === '55P03' || /lock timeout/i.test(databaseError.message || '')) {
          throw new Error(
            'La carga historica de compras esta bloqueada por otra conexion. ' +
            'Detenga las instancias del backend y vuelva a ejecutar la migracion; continuara sin duplicar registros.',
            { cause: error },
          );
        }
        throw error;
      }

      lastHistoryId = upperHistoryId;
      processed += rows.length;
      console.info(
        `[purchase-audit-backfill] ${processed} historiales revisados; ultimo id ${lastHistoryId}.`,
      );
    }

    console.info(`[purchase-audit-backfill] Carga historica finalizada: ${processed} historiales revisados.`);
  },

  // Audit events are intentionally immutable. The preceding schema migration
  // removes the complete table when the migration chain is rolled back.
  async down() {},
};

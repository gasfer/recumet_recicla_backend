'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../app/database/config');

const diagnose = async () => {
  const [missingDocuments, duplicateQuantities, incompleteLinks] = await Promise.all([
    sequelize.query(`
      SELECT a.id, a.id_transfer_review_note, a.id_transfer_review_note_detail,
             a.quantity, a.operation_mode, a.operation_type, a.operation_id
      FROM transfer_review_resolution_actions a
      WHERE a.management_status = 'ACTIVA'
        AND (a.operation_type IS NULL OR a.operation_id IS NULL)
      ORDER BY a.id
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT id_transfer_review_note_detail, SUM(quantity) AS active_quantity,
             COUNT(*) AS active_actions
      FROM transfer_review_resolution_actions
      WHERE management_status = 'ACTIVA' AND operation_status <> 'REVERSED'
      GROUP BY id_transfer_review_note_detail
      HAVING COUNT(*) > 1
      ORDER BY id_transfer_review_note_detail
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT a.id, a.operation_type, a.operation_id, COUNT(m.id) AS movement_links
      FROM transfer_review_resolution_actions a
      LEFT JOIN transfer_review_action_movements m
        ON m.id_transfer_review_resolution_action = a.id
      WHERE a.operation_mode = 'CREATED_AUTOMATICALLY'
        AND a.operation_status IN ('ACTIVE', 'REVERSAL_PENDING')
      GROUP BY a.id, a.operation_type, a.operation_id
      HAVING a.operation_id IS NULL OR COUNT(m.id) = 0
      ORDER BY a.id
    `, { type: QueryTypes.SELECT }),
  ]);

  return { missingDocuments, duplicateQuantities, incompleteLinks };
};

if (require.main === module) {
  diagnose()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.missingDocuments.length || result.duplicateQuantities.length || result.incompleteLinks.length ? 2 : 0;
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { diagnose };

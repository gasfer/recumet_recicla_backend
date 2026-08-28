'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO transfer_review_events (
        event_type,
        description,
        metadata,
        id_transfer_review_note,
        id_user,
        "createdAt",
        "updatedAt"
      )
      SELECT
        'MIGRADA',
        'Nota existente incorporada al flujo de revisión sin modificar stock ni Kardex.',
        jsonb_build_object('source', 'baseline-migration'),
        n.id,
        n.id_user,
        NOW(),
        NOW()
      FROM transfer_review_notes n
      WHERE NOT EXISTS (
        SELECT 1
        FROM transfer_review_events e
        WHERE e.id_transfer_review_note = n.id
      )
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM transfer_review_events
      WHERE event_type = 'MIGRADA'
        AND metadata->>'source' = 'baseline-migration'
    `);
  },
};

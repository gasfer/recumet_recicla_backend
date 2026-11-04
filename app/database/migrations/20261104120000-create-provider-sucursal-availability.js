'use strict';

const TABLE = 'provider_sucursal_availability';

module.exports = {
  async up(queryInterface, Sequelize) {
    const [preflightRows] = await queryInterface.sequelize.query(`
      WITH legacy_values AS (
        SELECT p.id AS id_provider, p.enabled_sucursal_ids, p.id_sucursal,
          e.value AS raw_value, e.value #>> '{}' AS branch_id
        FROM providers p
        LEFT JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(p.enabled_sucursal_ids) = 'array'
            THEN p.enabled_sucursal_ids ELSE '[]'::jsonb END
        ) e(value) ON TRUE
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'provider_id', id_provider,
        'branch_id', COALESCE(branch_id, raw_value::text),
        'reason', CASE
          WHEN enabled_sucursal_ids IS NOT NULL AND jsonb_typeof(enabled_sucursal_ids) <> 'array' THEN 'availability_is_not_an_array'
          WHEN enabled_sucursal_ids IS NULL AND id_sucursal IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = id_sucursal) THEN 'missing_registration_branch'
          WHEN raw_value IS NOT NULL AND (jsonb_typeof(raw_value) <> 'number' OR branch_id !~ '^[1-9][0-9]*$'
            OR CASE WHEN branch_id ~ '^[1-9][0-9]*$' THEN branch_id::numeric > 2147483647 ELSE FALSE END
            OR NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = CASE WHEN branch_id ~ '^[1-9][0-9]*$' AND branch_id::numeric <= 2147483647 THEN branch_id::integer END)) THEN 'invalid_availability_branch'
          ELSE NULL
        END
        ) ORDER BY id_provider), '[]'::jsonb) AS invalid_assignments
      FROM legacy_values
      WHERE (enabled_sucursal_ids IS NOT NULL AND jsonb_typeof(enabled_sucursal_ids) <> 'array')
        OR (enabled_sucursal_ids IS NULL AND id_sucursal IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = id_sucursal))
        OR (raw_value IS NOT NULL AND (jsonb_typeof(raw_value) <> 'number' OR branch_id !~ '^[1-9][0-9]*$'
          OR CASE WHEN branch_id ~ '^[1-9][0-9]*$' THEN branch_id::numeric > 2147483647 ELSE FALSE END
          OR NOT EXISTS (SELECT 1 FROM sucursals s WHERE s.id = CASE WHEN branch_id ~ '^[1-9][0-9]*$' AND branch_id::numeric <= 2147483647 THEN branch_id::integer END)))
    `);
    const preflight = preflightRows?.[0];
    if (preflight?.invalid_assignments?.length) {
      throw new Error(`Provider branch availability migration blocked by unresolved legacy data: ${JSON.stringify(preflight.invalid_assignments)}`);
    }

    await queryInterface.createTable(TABLE, {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      id_provider: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'providers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      id_sucursal: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'sucursals', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addConstraint(TABLE, {
      fields: ['id_provider', 'id_sucursal'],
      type: 'unique',
      name: 'provider_sucursal_availability_provider_branch_unique',
    });
    await queryInterface.addIndex(TABLE, ['id_sucursal', 'status'], {
      name: 'provider_sucursal_availability_branch_status_idx',
    });

    await queryInterface.sequelize.query(`
      WITH legacy_assignments AS (
        SELECT p.id AS id_provider, branch.value::integer AS id_sucursal
        FROM providers p
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p.enabled_sucursal_ids) = 'array'
            THEN p.enabled_sucursal_ids ELSE '[]'::jsonb END
        ) branch(value)
        WHERE branch.value ~ '^[1-9][0-9]*$' AND branch.value::numeric <= 2147483647
        UNION
        SELECT p.id, p.id_sucursal
        FROM providers p
        WHERE p.enabled_sucursal_ids IS NULL
          AND p.id_sucursal IS NOT NULL
        UNION
        SELECT p.id, i.id_sucursal
        FROM providers p
        JOIN inputs i ON i.id_provider = p.id
        WHERE p.enabled_sucursal_ids IS NULL
          AND p.id_sucursal IS NULL
          AND i.id_sucursal IS NOT NULL
          AND i.status = 'ACTIVE'
          AND i.voided_at IS NULL
      ), valid_assignments AS (
        SELECT DISTINCT legacy.id_provider, legacy.id_sucursal
        FROM legacy_assignments legacy
        JOIN sucursals s ON s.id = legacy.id_sucursal
      )
      INSERT INTO ${TABLE} (id_provider, id_sucursal, status, "createdAt", "updatedAt")
      SELECT id_provider, id_sucursal, TRUE, NOW(), NOW()
      FROM valid_assignments
      ON CONFLICT (id_provider, id_sucursal) DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE providers p
      SET enabled_sucursal_ids = COALESCE(
        (SELECT jsonb_agg(a.id_sucursal ORDER BY a.id_sucursal)
         FROM ${TABLE} a WHERE a.id_provider = p.id AND a.status = TRUE),
        '[]'::jsonb
      )
      WHERE EXISTS (SELECT 1 FROM ${TABLE} a WHERE a.id_provider = p.id)
    `);
    await queryInterface.dropTable(TABLE);
  },
};

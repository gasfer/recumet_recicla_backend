'use strict';

const GLOBAL_REGISTRY_INDEX = 'inputs_registry_number_unique';
const SCOPED_REGISTRY_INDEX = 'inputs_sucursal_type_registry_number_unique';
const SCOPED_REGISTRY_LOOKUP_INDEX = 'inputs_sucursal_type_registry_number_idx';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`
        DO $migration$
        DECLARE item_name TEXT;
        BEGIN
          FOR item_name IN
            SELECT con.conname
            FROM pg_constraint con
            WHERE con.conrelid = 'inputs'::regclass
              AND con.contype = 'u'
              AND con.conkey = ARRAY[(
                SELECT att.attnum
                FROM pg_attribute att
                WHERE att.attrelid = 'inputs'::regclass
                  AND att.attname = 'registry_number'
                  AND NOT att.attisdropped
              )]::SMALLINT[]
          LOOP
            EXECUTE format('ALTER TABLE inputs DROP CONSTRAINT %I', item_name);
          END LOOP;

          FOR item_name IN
            SELECT index_class.relname
            FROM pg_index idx
            JOIN pg_class index_class ON index_class.oid = idx.indexrelid
            WHERE idx.indrelid = 'inputs'::regclass
              AND idx.indisunique
              AND idx.indnkeyatts = 1
              AND idx.indkey[0] = (
                SELECT att.attnum
                FROM pg_attribute att
                WHERE att.attrelid = 'inputs'::regclass
                  AND att.attname = 'registry_number'
                  AND NOT att.attisdropped
              )
              AND NOT EXISTS (
                SELECT 1 FROM pg_constraint con WHERE con.conindid = idx.indexrelid
              )
          LOOP
            EXECUTE format('DROP INDEX %I', item_name);
          END LOOP;
        END;
        $migration$;
      `, { transaction });

      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${GLOBAL_REGISTRY_INDEX}`, { transaction });

      const [duplicateGroups] = await queryInterface.sequelize.query(`
        SELECT EXISTS (
          SELECT 1
          FROM inputs
          WHERE id_sucursal IS NOT NULL
            AND type_registry IS NOT NULL
            AND registry_number IS NOT NULL
          GROUP BY id_sucursal, type_registry, registry_number
          HAVING COUNT(*) > 1
        ) AS has_duplicates
      `, { transaction });

      if (duplicateGroups[0]?.has_duplicates) {
        console.warn(
          `No se creó ${SCOPED_REGISTRY_INDEX}: existen números de registro duplicados históricos. ` +
          'Se conserva la validación de la API y se crea un índice de búsqueda hasta depurar esos registros.',
        );
        await queryInterface.sequelize.query(
          `CREATE INDEX IF NOT EXISTS ${SCOPED_REGISTRY_LOOKUP_INDEX} ON inputs (id_sucursal, type_registry, registry_number)`,
          { transaction },
        );
      } else {
        await queryInterface.sequelize.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${SCOPED_REGISTRY_INDEX} ON inputs (id_sucursal, type_registry, registry_number)`,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${SCOPED_REGISTRY_INDEX}`, { transaction });
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${SCOPED_REGISTRY_LOOKUP_INDEX}`, { transaction });
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${GLOBAL_REGISTRY_INDEX} ON inputs (registry_number)`,
        { transaction },
      );
    });
  },
};

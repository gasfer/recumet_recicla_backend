'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE cj_cajas DROP CONSTRAINT IF EXISTS cj_cajas_id_sucursal_key;
      ALTER TABLE cj_cajas ADD COLUMN IF NOT EXISTS cashbox_type VARCHAR(12) NOT NULL DEFAULT 'CHICA';
      UPDATE cj_cajas SET cashbox_type = 'CHICA' WHERE cashbox_type IS NULL OR cashbox_type = '';
      ALTER TABLE cj_cajas DROP CONSTRAINT IF EXISTS ck_cj_cajas_cashbox_type;
      ALTER TABLE cj_cajas ADD CONSTRAINT ck_cj_cajas_cashbox_type
        CHECK (cashbox_type IN ('CHICA', 'MAYOR'));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cj_cajas_branch_type ON cj_cajas (id_sucursal, cashbox_type);

      INSERT INTO cj_cajas (id_sucursal, name, cashbox_type, status)
      SELECT id_sucursal, 'Caja Mayor - ' || COALESCE(name, 'Sucursal ' || id_sucursal::text), 'MAYOR', status
      FROM cj_cajas WHERE cashbox_type = 'CHICA'
      ON CONFLICT (id_sucursal, cashbox_type) DO NOTHING;

      INSERT INTO cj_cuentas_asignaciones (id_caja, id_cuenta, is_active, assigned_by)
      SELECT major.id, assignment.id_cuenta, assignment.is_active, assignment.assigned_by
      FROM cj_cajas chica
      JOIN cj_cajas major ON major.id_sucursal = chica.id_sucursal AND major.cashbox_type = 'MAYOR'
      JOIN cj_cuentas_asignaciones assignment ON assignment.id_caja = chica.id
      WHERE chica.cashbox_type = 'CHICA'
      ON CONFLICT (id_caja, id_cuenta) DO NOTHING;

      DROP INDEX IF EXISTS uq_caja_smalls_one_open_per_branch;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_smalls_one_open_per_branch_type
        ON caja_smalls (id_sucursal, cashbox_type) WHERE session_state = 'OPEN';

      ALTER TABLE cj_categoria_gasto ADD COLUMN IF NOT EXISTS cashbox_type VARCHAR(12) NOT NULL DEFAULT 'CHICA';
      ALTER TABLE cj_categoria_gasto DROP CONSTRAINT IF EXISTS cj_categoria_gasto_name_key;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cj_categoria_gasto_name_type ON cj_categoria_gasto (name, cashbox_type);
      INSERT INTO cj_categoria_gasto (name, description, is_active, cashbox_type, "createdAt", "updatedAt")
      SELECT name, description, is_active, 'MAYOR', NOW(), NOW()
      FROM cj_categoria_gasto WHERE cashbox_type = 'CHICA'
      ON CONFLICT (name, cashbox_type) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM caja_smalls WHERE cashbox_type = 'MAYOR') THEN
          RAISE EXCEPTION 'No se puede revertir: existen sesiones Caja Mayor; archive o migre esas sesiones primero.';
        END IF;
      END $$;
      DROP INDEX IF EXISTS uq_caja_smalls_one_open_per_branch_type;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_smalls_one_open_per_branch
        ON caja_smalls (id_sucursal) WHERE session_state = 'OPEN';
      DELETE FROM cj_cuentas_asignaciones a USING cj_cajas c
        WHERE a.id_caja = c.id AND c.cashbox_type = 'MAYOR';
      DELETE FROM cj_cajas WHERE cashbox_type = 'MAYOR';
      DROP INDEX IF EXISTS uq_cj_cajas_branch_type;
      DELETE FROM cj_categoria_gasto WHERE cashbox_type = 'MAYOR';
      DROP INDEX IF EXISTS uq_cj_categoria_gasto_name_type;
      ALTER TABLE cj_categoria_gasto DROP COLUMN IF EXISTS cashbox_type;
      ALTER TABLE cj_categoria_gasto ADD CONSTRAINT cj_categoria_gasto_name_key UNIQUE (name);
      ALTER TABLE cj_cajas DROP CONSTRAINT IF EXISTS ck_cj_cajas_cashbox_type;
      ALTER TABLE cj_cajas DROP COLUMN IF EXISTS cashbox_type;
      ALTER TABLE cj_cajas ADD CONSTRAINT cj_cajas_id_sucursal_key UNIQUE (id_sucursal);
    `);
  },
};

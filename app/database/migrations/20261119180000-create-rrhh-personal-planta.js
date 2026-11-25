'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS rrhh_personal_planta (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(160) NOT NULL,
        ci VARCHAR(32) NOT NULL,
        cellphone VARCHAR(24) NOT NULL,
        email VARCHAR(160),
        address VARCHAR(240),
        job_title VARCHAR(120),
        area VARCHAR(120),
        emergency_name VARCHAR(160),
        emergency_phone VARCHAR(24),
        emergency_relationship VARCHAR(80),
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INTEGER NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rrhh_personal_planta_ci_lower ON rrhh_personal_planta (LOWER(ci));

      CREATE TABLE IF NOT EXISTS rrhh_personal_planta_sucursales (
        id SERIAL PRIMARY KEY,
        id_personal INTEGER NOT NULL REFERENCES rrhh_personal_planta(id) ON UPDATE CASCADE ON DELETE CASCADE,
        id_sucursal INTEGER NOT NULL REFERENCES sucursals(id) ON UPDATE CASCADE ON DELETE CASCADE,
        assigned_by INTEGER NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_rrhh_personal_planta_sucursal UNIQUE (id_personal, id_sucursal)
      );
      CREATE INDEX IF NOT EXISTS ix_rrhh_personal_planta_sucursal ON rrhh_personal_planta_sucursales (id_sucursal);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS rrhh_personal_planta_sucursales;
      DROP TABLE IF EXISTS rrhh_personal_planta;
    `);
  },
};

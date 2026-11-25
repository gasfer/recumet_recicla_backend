'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sql = queryInterface.sequelize;
    await sql.query(`
      CREATE TABLE IF NOT EXISTS cj_cajas (
        id SERIAL PRIMARY KEY,
        id_sucursal INTEGER NOT NULL UNIQUE REFERENCES sucursals(id),
        name VARCHAR(160) NOT NULL,
        status BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      INSERT INTO cj_cajas (id_sucursal, name, status)
      SELECT s.id, 'Caja - ' || COALESCE(s.name, 'Sucursal ' || s.id::text), COALESCE(s.status, TRUE)
      FROM sucursals s
      ON CONFLICT (id_sucursal) DO NOTHING;

      CREATE TABLE IF NOT EXISTS cj_cuentas (
        id SERIAL PRIMARY KEY,
        code VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(160) NOT NULL,
        type VARCHAR(16) NOT NULL CHECK (type IN ('CASH', 'BANK', 'QR')),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        id_bank INTEGER NULL REFERENCES banks(id),
        account_reference VARCHAR(160) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cj_cuentas_asignaciones (
        id SERIAL PRIMARY KEY,
        id_caja INTEGER NOT NULL REFERENCES cj_cajas(id),
        id_cuenta INTEGER NOT NULL REFERENCES cj_cuentas(id),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        assigned_by INTEGER NULL REFERENCES users(id),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (id_caja, id_cuenta)
      );

      INSERT INTO cj_cuentas (code, name, type, currency)
      SELECT 'CASH-' || c.id_sucursal::text, 'Efectivo', 'CASH', 'BOB'
      FROM cj_cajas c
      ON CONFLICT (code) DO NOTHING;

      INSERT INTO cj_cuentas_asignaciones (id_caja, id_cuenta)
      SELECT c.id, a.id
      FROM cj_cajas c
      JOIN cj_cuentas a ON a.code = 'CASH-' || c.id_sucursal::text
      ON CONFLICT (id_caja, id_cuenta) DO NOTHING;

      -- Preserve identifiable bank movements on a bank account assigned only to branches where it was used.
      INSERT INTO cj_cuentas (code, name, type, currency, id_bank)
      SELECT DISTINCT 'BANK-' || d.id_bank::text || '-S' || cs.id_sucursal::text,
        COALESCE(b.name, 'Banco ' || d.id_bank::text), 'BANK', 'BOB', d.id_bank
      FROM details_caja_smalls d
      JOIN caja_smalls cs ON cs.id = d.id_caja_small
      JOIN banks b ON b.id = d.id_bank
      WHERE d.id_bank IS NOT NULL AND d.type_payment IN ('CHEQUE', 'TRASFERENCIA', 'TRANSFERENCIA', 'QR')
      ON CONFLICT (code) DO NOTHING;

      INSERT INTO cj_cuentas_asignaciones (id_caja, id_cuenta)
      SELECT DISTINCT c.id, a.id
      FROM details_caja_smalls d
      JOIN caja_smalls cs ON cs.id = d.id_caja_small
      JOIN cj_cajas c ON c.id_sucursal = cs.id_sucursal
      JOIN cj_cuentas a ON a.code = 'BANK-' || d.id_bank::text || '-S' || cs.id_sucursal::text
      WHERE d.id_bank IS NOT NULL AND d.type_payment IN ('CHEQUE', 'TRASFERENCIA', 'TRANSFERENCIA', 'QR')
      ON CONFLICT (id_caja, id_cuenta) DO NOTHING;

      ALTER TABLE caja_smalls ADD COLUMN IF NOT EXISTS id_caja INTEGER REFERENCES cj_cajas(id);
      ALTER TABLE caja_smalls ADD COLUMN IF NOT EXISTS session_state VARCHAR(24);
      UPDATE caja_smalls cs SET id_caja = c.id
      FROM cj_cajas c WHERE c.id_sucursal = cs.id_sucursal AND cs.id_caja IS NULL;

      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY id_sucursal ORDER BY date_apertura DESC NULLS LAST, id DESC) AS rn
        FROM caja_smalls WHERE status = 'ABIERTO'
      )
      UPDATE caja_smalls cs
      SET session_state = CASE WHEN ranked.rn = 1 THEN 'OPEN' ELSE 'LEGACY_REVIEW' END
      FROM ranked WHERE ranked.id = cs.id AND cs.session_state IS NULL;
      UPDATE caja_smalls SET session_state = 'CLOSED' WHERE session_state IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_smalls_one_open_per_branch
        ON caja_smalls (id_sucursal) WHERE session_state = 'OPEN';

      CREATE TABLE IF NOT EXISTS cj_sesion_saldos (
        id SERIAL PRIMARY KEY,
        id_caja_small INTEGER NOT NULL REFERENCES caja_smalls(id),
        id_cuenta INTEGER NOT NULL REFERENCES cj_cuentas(id),
        opening_amount NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        opening_observation TEXT NULL,
        id_user INTEGER NULL REFERENCES users(id),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (id_caja_small, id_cuenta)
      );

      -- Legacy monto_apertura is the original cash opening field. Preserve it as the cash snapshot.
      INSERT INTO cj_sesion_saldos (id_caja_small, id_cuenta, opening_amount, currency, opening_observation, id_user)
      SELECT cs.id, a.id, COALESCE(cs.monto_apertura, 0), 'BOB', 'Apertura migrada desde caja_smalls.monto_apertura', cs.id_user
      FROM caja_smalls cs
      JOIN cj_cajas c ON c.id = cs.id_caja
      JOIN cj_cuentas a ON a.code = 'CASH-' || c.id_sucursal::text
      WHERE cs.session_state IN ('OPEN', 'CLOSED')
      ON CONFLICT (id_caja_small, id_cuenta) DO NOTHING;

      ALTER TABLE details_caja_smalls ADD COLUMN IF NOT EXISTS id_cuenta INTEGER REFERENCES cj_cuentas(id);
      ALTER TABLE details_caja_smalls ADD COLUMN IF NOT EXISTS id_user INTEGER REFERENCES users(id);
      ALTER TABLE details_caja_smalls ADD COLUMN IF NOT EXISTS source_type VARCHAR(40);
      ALTER TABLE details_caja_smalls ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);
      ALTER TABLE details_caja_smalls ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);

      UPDATE details_caja_smalls d SET id_cuenta = a.id
      FROM caja_smalls cs
      JOIN cj_cajas c ON c.id_sucursal = cs.id_sucursal
      JOIN cj_cuentas a ON a.code = 'CASH-' || cs.id_sucursal::text
      WHERE cs.id = d.id_caja_small AND d.type_payment = 'EFECTIVO' AND d.id_cuenta IS NULL;

      UPDATE details_caja_smalls d SET id_cuenta = a.id
      FROM caja_smalls cs
      CROSS JOIN cj_cuentas a
      WHERE cs.id = d.id_caja_small AND d.id_bank IS NOT NULL
        AND a.code = 'BANK-' || d.id_bank::text || '-S' || cs.id_sucursal::text
        AND d.type_payment IN ('CHEQUE', 'TRASFERENCIA', 'TRANSFERENCIA', 'QR') AND d.id_cuenta IS NULL;

      CREATE TABLE IF NOT EXISTS cj_ledger (
        id BIGSERIAL PRIMARY KEY,
        id_caja_small INTEGER NOT NULL REFERENCES caja_smalls(id),
        id_cuenta INTEGER NOT NULL REFERENCES cj_cuentas(id),
        id_detail_caja_small INTEGER NULL REFERENCES details_caja_smalls(id),
        direction VARCHAR(8) NOT NULL CHECK (direction IN ('IN', 'OUT')),
        amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        source_type VARCHAR(40) NULL,
        source_id VARCHAR(100) NULL,
        idempotency_key VARCHAR(160) NULL UNIQUE,
        id_user INTEGER NULL REFERENCES users(id),
        posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        reversal_of BIGINT NULL REFERENCES cj_ledger(id),
        reason TEXT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_cj_ledger_session_account ON cj_ledger (id_caja_small, id_cuenta, posted_at);
      CREATE INDEX IF NOT EXISTS ix_cj_ledger_source ON cj_ledger (source_type, source_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cj_ledger_one_reversal ON cj_ledger (reversal_of) WHERE reversal_of IS NOT NULL;

      -- Keep every legacy movement's primary key, timestamp, amount and payment attribution.
      INSERT INTO cj_ledger (id_caja_small, id_cuenta, id_detail_caja_small, direction, amount, currency,
        source_type, source_id, idempotency_key, id_user, posted_at)
      SELECT d.id_caja_small, d.id_cuenta, d.id,
        CASE WHEN d.type = 'INGRESO' THEN 'IN' ELSE 'OUT' END, d.monto, a.currency,
        'LEGACY_DETAIL', d.id::text, 'LEGACY-DETAIL-' || d.id::text, d.id_user, COALESCE(d.date, d."createdAt", NOW())
      FROM details_caja_smalls d
      JOIN cj_cuentas a ON a.id = d.id_cuenta
      WHERE COALESCE(d.status, TRUE) = TRUE AND d.monto > 0 AND d.type IN ('INGRESO', 'GASTO')
      ON CONFLICT (idempotency_key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS cj_cierre_diario (
        id SERIAL PRIMARY KEY,
        id_caja_small INTEGER NOT NULL UNIQUE REFERENCES caja_smalls(id),
        id_user INTEGER NOT NULL REFERENCES users(id),
        status VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'REVERSED')),
        observations TEXT NULL,
        closed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cj_cierre_detalle (
        id SERIAL PRIMARY KEY,
        id_cierre INTEGER NOT NULL REFERENCES cj_cierre_diario(id),
        id_cuenta INTEGER NOT NULL REFERENCES cj_cuentas(id),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        expected_amount NUMERIC(18, 4) NOT NULL,
        counted_amount NUMERIC(18, 4) NOT NULL,
        difference NUMERIC(18, 4) NOT NULL,
        observations TEXT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (id_cierre, id_cuenta),
        CHECK (difference = counted_amount - expected_amount)
      );

      CREATE TABLE IF NOT EXISTS cj_categoria_gasto (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        description VARCHAR(500) NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      INSERT INTO cj_categoria_gasto (name, is_active) VALUES
        ('INSUMOS_CONSUMIBLES', TRUE), ('LUBRICANTES', TRUE), ('REPUESTOS_VEHICULOS', TRUE),
        ('REPUESTOS_MAQUINARIA', TRUE), ('MANT_PREVENTIVO', TRUE), ('MANT_CORRECTIVO', TRUE),
        ('SERV_TECNICOS', TRUE), ('SERVICIOS_BASICOS', TRUE), ('GASTOS_ADMIN', TRUE),
        ('REFRIGERIOS', TRUE), ('VIATICOS', TRUE), ('OTROS_GASTOS', TRUE),
        ('COMPRA_MAQUINARIA', TRUE), ('COMPRA_VEHICULO', TRUE), ('HERRAMIENTAS', TRUE), ('MUEBLES_EQUIPOS', TRUE)
      ON CONFLICT (name) DO NOTHING;

      CREATE TABLE IF NOT EXISTS cj_gastos (
        id SERIAL PRIMARY KEY,
        id_caja_small INTEGER NOT NULL REFERENCES caja_smalls(id),
        id_cuenta INTEGER NOT NULL REFERENCES cj_cuentas(id),
        id_categoria INTEGER NOT NULL REFERENCES cj_categoria_gasto(id),
        id_detail_caja_small INTEGER NULL UNIQUE REFERENCES details_caja_smalls(id),
        description VARCHAR(500) NOT NULL,
        amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        id_user INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cj_gastos_adjuntos (
        id SERIAL PRIMARY KEY,
        id_gasto INTEGER NOT NULL REFERENCES cj_gastos(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(1000) NOT NULL,
        mime_type VARCHAR(120) NOT NULL,
        file_size BIGINT NOT NULL CHECK (file_size > 0),
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_cj_gastos_adjuntos_expense ON cj_gastos_adjuntos (id_gasto);
    `);
  },

  async down(queryInterface) {
    const sql = queryInterface.sequelize;
    await sql.query(`
      DROP TABLE IF EXISTS cj_gastos_adjuntos CASCADE;
      DROP TABLE IF EXISTS cj_gastos CASCADE;
      DROP TABLE IF EXISTS cj_categoria_gasto CASCADE;
      DROP TABLE IF EXISTS cj_cierre_detalle CASCADE;
      DROP TABLE IF EXISTS cj_cierre_diario CASCADE;
      DROP TABLE IF EXISTS cj_ledger CASCADE;
      DROP TABLE IF EXISTS cj_sesion_saldos CASCADE;
      DROP INDEX IF EXISTS uq_caja_smalls_one_open_per_branch;
      ALTER TABLE details_caja_smalls DROP COLUMN IF EXISTS idempotency_key;
      ALTER TABLE details_caja_smalls DROP COLUMN IF EXISTS source_id;
      ALTER TABLE details_caja_smalls DROP COLUMN IF EXISTS source_type;
      ALTER TABLE details_caja_smalls DROP COLUMN IF EXISTS id_user;
      ALTER TABLE details_caja_smalls DROP COLUMN IF EXISTS id_cuenta;
      ALTER TABLE caja_smalls DROP COLUMN IF EXISTS session_state;
      ALTER TABLE caja_smalls DROP COLUMN IF EXISTS id_caja;
      DROP TABLE IF EXISTS cj_cuentas_asignaciones CASCADE;
      DROP TABLE IF EXISTS cj_cuentas CASCADE;
      DROP TABLE IF EXISTS cj_cajas CASCADE;
    `);
  },
};

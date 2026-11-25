'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION cj_validate_account_assignment_policy()
      RETURNS TRIGGER AS $$
      DECLARE
        caja_tipo VARCHAR(12);
        cuenta_tipo VARCHAR(16);
        cuenta_moneda VARCHAR(3);
        cuenta_banco INTEGER;
        duplicados INTEGER;
      BEGIN
        IF NOT NEW.is_active THEN RETURN NEW; END IF;

        IF TG_OP = 'UPDATE'
          AND OLD.is_active = NEW.is_active
          AND OLD.id_caja = NEW.id_caja
          AND OLD.id_cuenta = NEW.id_cuenta THEN
          RETURN NEW;
        END IF;

        PERFORM pg_advisory_xact_lock(73019, NEW.id_caja);

        SELECT c.cashbox_type, a.type, a.currency, a.id_bank
          INTO caja_tipo, cuenta_tipo, cuenta_moneda, cuenta_banco
          FROM cj_cajas c JOIN cj_cuentas a ON a.id = NEW.id_cuenta
          WHERE c.id = NEW.id_caja AND a.is_active = TRUE;
        IF caja_tipo IS NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: cuenta o caja inactiva/no encontrada';
        END IF;

        IF caja_tipo = 'CHICA' AND (cuenta_moneda <> 'BOB' OR cuenta_tipo NOT IN ('CASH', 'BANK')) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Chica solo admite efectivo y una cuenta bancaria en BOB';
        END IF;
        IF caja_tipo = 'MAYOR' AND (cuenta_moneda NOT IN ('BOB', 'USD') OR cuenta_tipo NOT IN ('CASH', 'BANK', 'QR')) THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Mayor admite cuentas CASH/BANK/QR en BOB o USD';
        END IF;
        IF cuenta_tipo = 'BANK' AND cuenta_banco IS NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: toda cuenta bancaria debe vincularse a un banco';
        END IF;

        IF cuenta_tipo = 'CASH' THEN
          SELECT COUNT(*) INTO duplicados
            FROM cj_cuentas_asignaciones ca
            JOIN cj_cuentas a ON a.id = ca.id_cuenta
            WHERE ca.id_caja = NEW.id_caja AND ca.is_active = TRUE
              AND a.is_active = TRUE AND a.type = 'CASH'
              AND a.currency = cuenta_moneda AND ca.id <> COALESCE(NEW.id, -1);
          IF duplicados > 0 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: solo se permite una cuenta de efectivo por moneda en cada Caja';
          END IF;
        END IF;

        IF caja_tipo = 'CHICA' AND cuenta_tipo = 'BANK' THEN
          SELECT COUNT(*) INTO duplicados
            FROM cj_cuentas_asignaciones ca
            JOIN cj_cuentas a ON a.id = ca.id_cuenta
            WHERE ca.id_caja = NEW.id_caja AND ca.is_active = TRUE
              AND a.is_active = TRUE AND a.type = 'BANK'
              AND ca.id <> COALESCE(NEW.id, -1);
          IF duplicados > 0 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Chica solo permite una cuenta bancaria activa';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION cj_validate_account_policy_update()
      RETURNS TRIGGER AS $$
      DECLARE
        caja_tipo VARCHAR(12);
        caja_id INTEGER;
        duplicados INTEGER;
      BEGIN
        IF NEW.type = OLD.type AND NEW.currency = OLD.currency AND NEW.id_bank IS NOT DISTINCT FROM OLD.id_bank
          AND NEW.is_active = OLD.is_active THEN RETURN NEW; END IF;
        IF NEW.type NOT IN ('CASH', 'BANK', 'QR') OR NEW.currency NOT IN ('BOB', 'USD') THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: tipo o moneda de cuenta invalida';
        END IF;
        IF NEW.type = 'BANK' AND NEW.id_bank IS NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: toda cuenta bancaria debe vincularse a un banco';
        END IF;
        IF NEW.is_active THEN
          FOR caja_tipo, caja_id IN
            SELECT c.cashbox_type, c.id FROM cj_cuentas_asignaciones ca
            JOIN cj_cajas c ON c.id = ca.id_caja
            WHERE ca.id_cuenta = NEW.id AND ca.is_active = TRUE
          LOOP
            PERFORM pg_advisory_xact_lock(73019, caja_id);
            IF caja_tipo = 'CHICA' AND (NEW.currency <> 'BOB' OR NEW.type NOT IN ('CASH', 'BANK')) THEN
              RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Chica solo admite efectivo y una cuenta bancaria en BOB';
            END IF;
            IF caja_tipo = 'MAYOR' AND (NEW.currency NOT IN ('BOB', 'USD') OR NEW.type NOT IN ('CASH', 'BANK', 'QR')) THEN
              RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Mayor admite cuentas CASH/BANK/QR en BOB o USD';
            END IF;
            IF caja_tipo = 'CHICA' AND NEW.type = 'BANK' THEN
              SELECT COUNT(*) INTO duplicados FROM cj_cuentas_asignaciones ca
              JOIN cj_cuentas a ON a.id = ca.id_cuenta
              WHERE ca.id_caja = caja_id AND ca.is_active = TRUE
                AND a.is_active = TRUE AND a.type = 'BANK' AND a.id <> NEW.id;
              IF duplicados > 0 THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: Caja Chica solo permite una cuenta bancaria activa';
              END IF;
            END IF;
            IF NEW.type = 'CASH' THEN
              SELECT COUNT(*) INTO duplicados FROM cj_cuentas_asignaciones ca
              JOIN cj_cuentas a ON a.id = ca.id_cuenta
              WHERE ca.id_caja IN (SELECT id_caja FROM cj_cuentas_asignaciones WHERE id_cuenta = NEW.id AND is_active = TRUE)
                AND ca.is_active = TRUE AND a.is_active = TRUE AND a.type = 'CASH'
                AND a.currency = NEW.currency AND a.id <> NEW.id;
              IF duplicados > 0 THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CJ_ACCOUNT_POLICY: solo se permite una cuenta de efectivo por moneda en cada Caja';
              END IF;
            END IF;
          END LOOP;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS tr_cj_account_assignment_policy ON cj_cuentas_asignaciones;
      CREATE TRIGGER tr_cj_account_assignment_policy
        BEFORE INSERT OR UPDATE ON cj_cuentas_asignaciones
        FOR EACH ROW EXECUTE FUNCTION cj_validate_account_assignment_policy();
      DROP TRIGGER IF EXISTS tr_cj_account_policy_update ON cj_cuentas;
      CREATE TRIGGER tr_cj_account_policy_update
        BEFORE UPDATE ON cj_cuentas
        FOR EACH ROW EXECUTE FUNCTION cj_validate_account_policy_update();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS tr_cj_account_assignment_policy ON cj_cuentas_asignaciones;
      DROP TRIGGER IF EXISTS tr_cj_account_policy_update ON cj_cuentas;
      DROP FUNCTION IF EXISTS cj_validate_account_assignment_policy();
      DROP FUNCTION IF EXISTS cj_validate_account_policy_update();
    `);
  },
};

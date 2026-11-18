-- Corte de línea base para sucursal 1.
-- EJECUCIÓN ÚNICA: si ya existe la línea base de sucursal 1, el script se detiene.
-- Ejecutar en una ventana de mantenimiento, con backend y movimientos detenidos.
-- Igualará Stock al neto del Kardex vigente y limpiará solo pendientes de revisión.
-- Conserva transfers, details_transfers y kardex_movements.
-- Revisar primero stock-kardex-baseline-reset-preview.sql.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '180s';

-- Evita escrituras concurrentes mientras se calcula, actualiza y verifica el corte.
LOCK TABLE stocks, kardex_movements, transfers, details_transfers,
  inventory_discrepancy_baselines,
  stock_reconciliation_cases, stock_reconciliation_events,
  stock_reconciliation_evidences, stock_reconciliation_decisions,
  stock_reconciliation_authorizations, stock_reconciliation_actions,
  transfer_review_notes, transfer_review_note_details,
  transfer_review_inventory_holds, transfer_review_resolution_actions,
  transfer_review_action_movements, transfer_review_events,
  transfer_review_evidences
IN SHARE ROW EXCLUSIVE MODE;

-- Impide volver a igualar saldos o borrar pendientes que hayan nacido después del corte.
DO $guard_baseline_once$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM inventory_discrepancy_baselines
    WHERE id_sucursal = 1 AND id_storage IS NULL
  ) THEN
    RAISE EXCEPTION 'Corte ya aplicado para sucursal 1. No vuelva a ejecutar este SQL; los pendientes posteriores pertenecen al nuevo período.';
  END IF;
END
$guard_baseline_once$;

-- Una sola fila activa por producto/almacén es necesaria para una actualización inequívoca.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stocks
    WHERE status IS TRUE AND id_sucursal = 1
    GROUP BY id_product, id_sucursal, id_storage
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Corte cancelado: hay ubicaciones con más de una fila Stock activa en la sucursal 1. Corrija esos duplicados y vuelva a ejecutar.';
  END IF;
END
$guard$;

CREATE TEMP TABLE baseline_stock_kardex_targets ON COMMIT DROP AS
WITH kardex AS (
  SELECT vk.id_product, vk.id_sucursal, vk.id_storage,
    COALESCE(SUM(vk.quantity_input), 0) - COALESCE(SUM(vk.quantity_output), 0) AS kardex_balance
  FROM view_kardex_detalle vk
  WHERE vk.date <= CURRENT_TIMESTAMP
    AND vk.id_sucursal = 1
  GROUP BY vk.id_product, vk.id_sucursal, vk.id_storage
), active_stock AS (
  SELECT s.id_product, s.id_sucursal, s.id_storage,
    COUNT(*) AS active_stock_rows, SUM(s.stock) AS current_stock
  FROM stocks s
  WHERE s.status IS TRUE AND s.id_sucursal = 1
  GROUP BY s.id_product, s.id_sucursal, s.id_storage
), locations AS (
  SELECT id_product, id_sucursal, id_storage FROM kardex
  UNION
  SELECT id_product, id_sucursal, id_storage FROM active_stock
)
SELECT l.id_product, l.id_sucursal, l.id_storage,
  COALESCE(a.active_stock_rows, 0)::integer AS active_stock_rows,
  COALESCE(a.current_stock, 0)::numeric AS current_stock,
  COALESCE(k.kardex_balance, 0)::numeric AS kardex_balance
FROM locations l
LEFT JOIN active_stock a USING (id_product, id_sucursal, id_storage)
LEFT JOIN kardex k USING (id_product, id_sucursal, id_storage);

-- Si Kardex tiene saldo y no existe fila activa, crea la fila Stock faltante.
INSERT INTO stocks (stock_min, stock, id_product, id_sucursal, id_storage, status, "createdAt", "updatedAt")
SELECT NULL, t.kardex_balance, t.id_product, t.id_sucursal, t.id_storage, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM baseline_stock_kardex_targets t
WHERE t.active_stock_rows = 0 AND t.kardex_balance <> 0;

-- Para cada ubicación con fila activa, el saldo objetivo es exactamente el neto de Kardex.
UPDATE stocks s
SET stock = t.kardex_balance,
    "updatedAt" = CURRENT_TIMESTAMP
FROM baseline_stock_kardex_targets t
WHERE s.status IS TRUE
  AND s.id_sucursal = 1
  AND s.id_product = t.id_product
  AND s.id_sucursal = t.id_sucursal
  AND s.id_storage = t.id_storage
  AND s.stock IS DISTINCT FROM t.kardex_balance;

-- No se limpian pendientes si queda alguna diferencia en las ubicaciones del corte.
DO $verify_balances$
BEGIN
  IF EXISTS (
    WITH stock_now AS (
      SELECT id_product, id_sucursal, id_storage, COUNT(*) AS rows_count, SUM(stock) AS balance
      FROM stocks
      WHERE status IS TRUE AND id_sucursal = 1
      GROUP BY id_product, id_sucursal, id_storage
    ), kardex_now AS (
      SELECT id_product, id_sucursal, id_storage,
        COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS balance
      FROM view_kardex_detalle
      WHERE date <= CURRENT_TIMESTAMP AND id_sucursal = 1
      GROUP BY id_product, id_sucursal, id_storage
    ), locations AS (
      SELECT id_product, id_sucursal, id_storage FROM stock_now
      UNION
      SELECT id_product, id_sucursal, id_storage FROM kardex_now
    )
    SELECT 1
    FROM locations l
    LEFT JOIN stock_now s USING (id_product, id_sucursal, id_storage)
    LEFT JOIN kardex_now k USING (id_product, id_sucursal, id_storage)
    WHERE COALESCE(s.rows_count, 0) > 1
       OR COALESCE(s.balance, 0) IS DISTINCT FROM COALESCE(k.balance, 0)
  ) THEN
    RAISE EXCEPTION 'Corte cancelado: Stock y Kardex todavía difieren en una o más ubicaciones de la sucursal 1; la transacción se revertirá completa.';
  END IF;
END
$verify_balances$;

CREATE TEMP TABLE baseline_open_review_note_ids ON COMMIT DROP AS
SELECT n.id
FROM transfer_review_notes n
WHERE n.id_sucursal = 1
  AND n.management_status = 'ACTIVA'
  AND (
    n.reconciliation_status <> 'COMPLETADO'
    OR EXISTS (
      SELECT 1 FROM transfer_review_note_details d
      WHERE d.id_transfer_review_note = n.id
        AND d.reconciliation_status <> 'COMPLETADO'
    )
  );

CREATE TEMP TABLE baseline_open_stock_case_ids ON COMMIT DROP AS
SELECT id
FROM stock_reconciliation_cases
WHERE id_sucursal = 1 AND status <> 'RESUELTA';

-- Una acción automática aún operativa podría estar ligada a documentos de inventario.
-- El corte se detiene para no borrar su vínculo de control por accidente.
DO $guard_actions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM transfer_review_resolution_actions a
    JOIN baseline_open_review_note_ids n ON n.id = a.id_transfer_review_note
    WHERE a.management_status = 'ACTIVA'
      AND a.operation_mode = 'CREATED_AUTOMATICALLY'
      AND a.operation_status IN ('ACTIVE', 'PENDING_RECEPTION', 'REVERSAL_PENDING')
  ) THEN
    RAISE EXCEPTION 'Corte cancelado: hay acciones automáticas activas o pendientes en boletas abiertas. Revise sus documentos vinculados antes de limpiar.';
  END IF;
END
$guard_actions$;

-- Borra solo metadatos pendientes de conciliación; no borra boletas, detalles ni movimientos Kardex.
DELETE FROM transfer_review_action_movements link
USING transfer_review_resolution_actions a, baseline_open_review_note_ids n
WHERE a.id = link.id_transfer_review_resolution_action
  AND a.id_transfer_review_note = n.id;

DELETE FROM transfer_review_resolution_actions a
USING baseline_open_review_note_ids n
WHERE a.id_transfer_review_note = n.id;

DELETE FROM transfer_review_inventory_holds h
USING transfer_review_note_details d, baseline_open_review_note_ids n
WHERE h.id_transfer_review_note_detail = d.id
  AND d.id_transfer_review_note = n.id;

DELETE FROM transfer_review_events e
USING baseline_open_review_note_ids n
WHERE e.id_transfer_review_note = n.id;

DELETE FROM transfer_review_evidences e
USING baseline_open_review_note_ids n
WHERE e.id_transfer_review_note = n.id;

DELETE FROM transfer_review_note_details d
USING baseline_open_review_note_ids n
WHERE d.id_transfer_review_note = n.id;

DELETE FROM transfer_review_notes n
USING baseline_open_review_note_ids target
WHERE n.id = target.id;

-- Limpia los casos Stock–Kardex sin resolver y sus registros dependientes.
DELETE FROM stock_reconciliation_actions a
USING baseline_open_stock_case_ids c
WHERE a.id_stock_reconciliation_case = c.id;

DELETE FROM stock_reconciliation_authorizations a
USING baseline_open_stock_case_ids c
WHERE a.id_stock_reconciliation_case = c.id;

DELETE FROM stock_reconciliation_decisions d
USING baseline_open_stock_case_ids c
WHERE d.id_stock_reconciliation_case = c.id;

DELETE FROM stock_reconciliation_evidences e
USING baseline_open_stock_case_ids c
WHERE e.id_stock_reconciliation_case = c.id;

DELETE FROM stock_reconciliation_events e
USING baseline_open_stock_case_ids c
WHERE e.id_stock_reconciliation_case = c.id;

DELETE FROM stock_reconciliation_cases c
USING baseline_open_stock_case_ids target
WHERE c.id = target.id;

-- Registra el corte una sola vez. Si el script se repite, ON CONFLICT conserva
-- la fecha original y no oculta recepciones futuras.
INSERT INTO inventory_discrepancy_baselines (
  id_sucursal, id_storage, baseline_at, reason, "createdAt", "updatedAt"
)
VALUES (
  1, NULL, clock_timestamp(),
  'Inicio de línea base después del conteo físico y la igualación Stock–Kardex.',
  clock_timestamp(), clock_timestamp()
)
ON CONFLICT (id_sucursal) WHERE id_storage IS NULL DO NOTHING;

-- Validación final; una sola diferencia o pendiente aborta todo el corte.
DO $verify_cut$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transfer_review_notes n
    WHERE n.id_sucursal = 1
      AND n.management_status = 'ACTIVA'
      AND (n.reconciliation_status <> 'COMPLETADO' OR EXISTS (
        SELECT 1 FROM transfer_review_note_details d
        WHERE d.id_transfer_review_note = n.id AND d.reconciliation_status <> 'COMPLETADO'
      ))
  ) THEN
    RAISE EXCEPTION 'Corte cancelado: aún existen notas de recepción pendientes en sucursal 1.';
  END IF;
  IF EXISTS (SELECT 1 FROM stock_reconciliation_cases WHERE id_sucursal = 1 AND status <> 'RESUELTA') THEN
    RAISE EXCEPTION 'Corte cancelado: aún existen casos Stock–Kardex pendientes en sucursal 1.';
  END IF;
END
$verify_cut$;

-- Resumen final; si alguna validación o bloqueo falla, PostgreSQL revierte el bloque.
SELECT
  (SELECT COUNT(*) FROM baseline_stock_kardex_targets) AS ubicaciones_revisadas,
  (SELECT COUNT(*) FROM baseline_open_review_note_ids) AS notas_abiertas_eliminadas,
  (SELECT COUNT(*) FROM baseline_open_stock_case_ids) AS casos_stock_kardex_eliminados,
  (SELECT COUNT(*) FROM transfer_review_notes n
    WHERE n.id_sucursal = 1 AND n.management_status = 'ACTIVA'
      AND (n.reconciliation_status <> 'COMPLETADO' OR EXISTS (
        SELECT 1 FROM transfer_review_note_details d
        WHERE d.id_transfer_review_note = n.id AND d.reconciliation_status <> 'COMPLETADO'
      ))) AS notas_pendientes_restantes,
  (SELECT COUNT(*) FROM stock_reconciliation_cases
    WHERE id_sucursal = 1 AND status <> 'RESUELTA') AS casos_pendientes_restantes,
  (SELECT baseline_at FROM inventory_discrepancy_baselines
    WHERE id_sucursal = 1 AND id_storage IS NULL) AS fecha_linea_base,
  (SELECT COUNT(*)
    FROM details_transfers dt
    JOIN transfers tr ON tr.id = dt.id_transfer
    JOIN inventory_discrepancy_baselines b
      ON b.id_sucursal = tr.id_sucursal_received
     AND (b.id_storage IS NULL OR b.id_storage = tr.id_storage_received)
    WHERE tr.status = 'RECEIVED'
      AND COALESCE(tr.date_received, tr.date_send) <= b.baseline_at
      AND dt.quantity_received IS NOT NULL
      AND dt.quantity IS DISTINCT FROM dt.quantity_received) AS diferencias_historicas_fuera_de_revision;

-- La transacción se confirma automáticamente al terminar correctamente.
COMMIT;

-- Conciliación previa y base limpia para comenzar nuevos traslados.
-- Paso 1: ejecutar solo el diagnóstico en la pestaña de salida de Postgres.
-- Paso 2: revisar el resultado y confirmar la política de saldos antes de aplicar.
-- Este archivo NO se conecta ni ejecuta contra ninguna base de datos.

-- ==============================
-- 1. DIAGNÓSTICO (SOLO LECTURA)
-- ==============================
-- Ejecutar las consultas individualmente en DBeaver. No necesita BEGIN/COMMIT.

WITH kardex AS (
  SELECT id_product, id_sucursal, id_storage,
         COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_stock,
         COUNT(*) AS movement_count,
         MAX(date) AS last_movement_at
  FROM view_kardex_detalle
  WHERE date <= CURRENT_TIMESTAMP
  GROUP BY id_product, id_sucursal, id_storage
), active_stock AS (
  SELECT id_product, id_sucursal, id_storage, stock, stock_min
  FROM stocks WHERE status = TRUE
), held AS (
  SELECT id_product, id_sucursal, id_storage,
         COALESCE(SUM(quantity) FILTER (WHERE disposition <> 'LIBERADO_POR_AJUSTE'), 0) AS held_quantity
  FROM transfer_review_inventory_holds
  GROUP BY id_product, id_sucursal, id_storage
), open_transfers AS (
  SELECT dt.id_product, tr.id_sucursal_send AS id_sucursal, tr.id_storage_send AS id_storage,
         SUM(dt.quantity) AS pending_send
  FROM details_transfers dt
  JOIN transfers tr ON tr.id = dt.id_transfer
  WHERE tr.status = 'PENDING'
  GROUP BY dt.id_product, tr.id_sucursal_send, tr.id_storage_send
), locations AS (
  SELECT id_product, id_sucursal, id_storage FROM active_stock
  UNION
  SELECT id_product, id_sucursal, id_storage FROM kardex
  UNION
  SELECT id_product, id_sucursal, id_storage FROM held
  UNION
  SELECT id_product, id_sucursal, id_storage FROM open_transfers
)
SELECT l.id_product, p.cod, p.name, u.siglas AS unit,
       l.id_sucursal, su.name AS sucursal, l.id_storage, st.name AS almacen,
       COALESCE(s.stock, 0) AS stock_actual,
       COALESCE(k.kardex_stock, 0) AS kardex_historico,
       COALESCE(s.stock, 0) - COALESCE(k.kardex_stock, 0) AS diferencia_stock_menos_kardex,
       COALESCE(h.held_quantity, 0) AS cantidad_retenida_conciliaciones,
       COALESCE(o.pending_send, 0) AS cantidad_en_traslados_pendientes,
       COALESCE(s.stock, 0) - COALESCE(h.held_quantity, 0) AS stock_disponible_menos_retenidos,
       COALESCE(k.movement_count, 0) AS movimientos_historicos,
       k.last_movement_at
FROM locations l
JOIN products p ON p.id = l.id_product
LEFT JOIN units u ON u.id = p.id_unit
LEFT JOIN sucursals su ON su.id = l.id_sucursal
LEFT JOIN storages st ON st.id = l.id_storage
LEFT JOIN active_stock s ON s.id_product = l.id_product
  AND s.id_sucursal = l.id_sucursal AND s.id_storage = l.id_storage
LEFT JOIN kardex k ON k.id_product = l.id_product
  AND k.id_sucursal = l.id_sucursal AND k.id_storage = l.id_storage
LEFT JOIN held h ON h.id_product = l.id_product
  AND h.id_sucursal = l.id_sucursal AND h.id_storage = l.id_storage
LEFT JOIN open_transfers o ON o.id_product = l.id_product
  AND o.id_sucursal = l.id_sucursal AND o.id_storage = l.id_storage
WHERE COALESCE(s.stock, 0) <> COALESCE(k.kardex_stock, 0)
   OR COALESCE(h.held_quantity, 0) <> 0
   OR COALESCE(o.pending_send, 0) <> 0
ORDER BY su.name, st.name, p.cod;

-- Controles: duplicados de Stock activo y efectos explícitos duplicados.
SELECT id_product, id_sucursal, id_storage, COUNT(*) AS filas_activas
FROM stocks WHERE status = TRUE
GROUP BY id_product, id_sucursal, id_storage HAVING COUNT(*) > 1;

SELECT source_type, source_id, source_detail_id, effect_type, COUNT(*) AS efectos
FROM kardex_movements
WHERE status = TRUE AND source_type IS NOT NULL AND source_id IS NOT NULL
  AND source_detail_id IS NOT NULL AND effect_type IS NOT NULL
GROUP BY source_type, source_id, source_detail_id, effect_type
HAVING COUNT(*) > 1;

-- Reservas retenidas y casos Stock–Kardex todavía abiertos.
SELECT id_product, id_sucursal, id_storage, disposition, SUM(quantity) AS cantidad
FROM transfer_review_inventory_holds
WHERE disposition <> 'LIBERADO_POR_AJUSTE'
GROUP BY id_product, id_sucursal, id_storage, disposition
ORDER BY id_sucursal, id_storage, id_product;
SELECT id, id_product, id_sucursal, id_storage, status, physical_stock_observed,
       kardex_balance_observed, difference_observed
FROM stock_reconciliation_cases
WHERE status <> 'RESUELTA'
ORDER BY id_sucursal, id_storage, id_product;

-- No se borra ni altera ningún dato en el diagnóstico.


-- =====================================================
-- 2. AJUSTE AUDITABLE DEL STOCK AL SALDO DEL KARDEX
-- =====================================================
-- IMPORTANTE: no ejecutar esta sección si existen traslados PENDING.
-- Use primero el diagnóstico por separado y cierre los pendientes con el
-- flujo auditado del sistema. La excepción P0001 es intencional y evita
-- que este bloque altere saldos mientras existan traslados pendientes.
-- EJECUTAR SOLO DESPUÉS DE REVISAR LA SALIDA DEL PASO 1.
-- No resetea ni borra traslados existentes. Conserva íntegro el historial y
-- actualiza únicamente stocks.stock en las ubicaciones donde difiere del saldo
-- histórico calculado por la misma vista que usa el sistema.
-- Si se requiere reiniciar traslados anteriores, hacer ese proceso por separado
-- y con reversas operativas auditables; no borrar filas de transfers/Kardex.

BEGIN;
LOCK TABLE stocks IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE stock_kardex_before_fix ON COMMIT DROP AS
WITH kardex AS (
  SELECT id_product, id_sucursal, id_storage,
         COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_stock
  FROM view_kardex_detalle
  WHERE date <= CURRENT_TIMESTAMP
  GROUP BY id_product, id_sucursal, id_storage
), locations AS (
  SELECT id_product, id_sucursal, id_storage FROM stocks WHERE status = TRUE
  UNION
  SELECT id_product, id_sucursal, id_storage FROM kardex
)
SELECT l.id_product, l.id_sucursal, l.id_storage,
       COALESCE(s.stock, 0) AS stock_anterior,
       COALESCE(k.kardex_stock, 0) AS kardex_historico,
       s.id AS stock_id,
       s.stock_min
FROM locations l
LEFT JOIN stocks s ON s.id_product = l.id_product AND s.id_sucursal = l.id_sucursal
  AND s.id_storage = l.id_storage AND s.status = TRUE
LEFT JOIN kardex k ON k.id_product = l.id_product
  AND k.id_sucursal = l.id_sucursal AND k.id_storage = l.id_storage;

-- Bloquea si hay duplicados o traslados pendientes: resolverlos antes del reset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stocks WHERE status = TRUE
    GROUP BY id_product, id_sucursal, id_storage HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Hay duplicados de Stock activo. No se aplicó el ajuste.'; END IF;
  IF EXISTS (SELECT 1 FROM transfers WHERE status = 'PENDING') THEN
    RAISE EXCEPTION 'Hay traslados PENDING. Cerrarlos o cancelarlos con flujo auditado antes de igualar stock.';
  END IF;
  IF EXISTS (SELECT 1 FROM stock_reconciliation_cases WHERE status <> 'RESUELTA') THEN
    RAISE EXCEPTION 'Hay casos de conciliación Stock–Kardex abiertos. Resolverlos antes del ajuste.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfer_review_inventory_holds WHERE disposition <> 'LIBERADO_POR_AJUSTE'
  ) THEN RAISE EXCEPTION 'Hay cantidades retenidas por conciliación. Resolverlas antes del ajuste.'; END IF;
  IF EXISTS (
    SELECT 1 FROM transfer_review_notes WHERE reconciliation_status <> 'COMPLETADO'
  ) THEN RAISE EXCEPTION 'Hay notas de revisión de traslado abiertas. Resolverlas antes del ajuste.'; END IF;
  IF EXISTS (
    SELECT 1 FROM kardex_movements WHERE status = TRUE AND source_type IS NOT NULL
      AND source_id IS NOT NULL AND source_detail_id IS NOT NULL AND effect_type IS NOT NULL
    GROUP BY source_type, source_id, source_detail_id, effect_type HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Hay efectos Kardex duplicados. Investigar antes del ajuste.'; END IF;
END $$;

-- Solo modifica ubicaciones con fila de stock activa y diferencia confirmada.
UPDATE stocks s
SET stock = b.kardex_historico,
    "updatedAt" = CURRENT_TIMESTAMP
FROM stock_kardex_before_fix b
WHERE s.id = b.stock_id
  AND s.status = TRUE
  AND s.stock IS DISTINCT FROM b.kardex_historico;

-- Crea las filas Stock que faltan cuando sí existe saldo histórico distinto de cero.
INSERT INTO stocks (stock_min, stock, id_product, id_sucursal, id_storage, status, "createdAt", "updatedAt")
SELECT COALESCE(b.stock_min, 1), b.kardex_historico, b.id_product, b.id_sucursal, b.id_storage, TRUE,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM stock_kardex_before_fix b
WHERE b.stock_id IS NULL AND b.kardex_historico <> 0;

-- Verificación dentro de la transacción. Debe devolver cero filas.
WITH kardex AS (
  SELECT id_product, id_sucursal, id_storage,
         COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_stock
  FROM view_kardex_detalle WHERE date <= CURRENT_TIMESTAMP
  GROUP BY id_product, id_sucursal, id_storage
), locations AS (
  SELECT id_product, id_sucursal, id_storage FROM stocks WHERE status = TRUE
  UNION SELECT id_product, id_sucursal, id_storage FROM kardex
)
SELECT l.id_product, p.cod, p.name, l.id_sucursal, l.id_storage,
       COALESCE(s.stock, 0) AS stock_actual, COALESCE(k.kardex_stock, 0) AS kardex_historico
FROM locations l JOIN products p ON p.id = l.id_product
LEFT JOIN stocks s ON s.id_product = l.id_product AND s.id_sucursal = l.id_sucursal
  AND s.id_storage = l.id_storage AND s.status = TRUE
LEFT JOIN kardex k ON k.id_product = l.id_product
  AND k.id_sucursal = l.id_sucursal AND k.id_storage = l.id_storage
WHERE COALESCE(s.stock, 0) <> COALESCE(k.kardex_stock, 0);

-- Revisar primero y reemplazar por COMMIT cuando el resultado de verificación
-- sea correcto; si no, ejecutar ROLLBACK.
ROLLBACK;

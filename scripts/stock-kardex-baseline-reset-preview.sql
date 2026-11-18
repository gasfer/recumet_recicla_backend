-- Solo lectura. Ejecutar primero en la base de destino y revisar todos los resultados.
-- El corte está limitado a sucursal 1, igual que el ajuste de saldos proporcionado.

-- Si esta tabla aún no existe, aplique primero las migraciones de la aplicación.
SELECT id_sucursal, id_storage, baseline_at, reason
FROM inventory_discrepancy_baselines
WHERE id_sucursal = 1
ORDER BY id_storage NULLS FIRST;

WITH open_cases AS (
  SELECT id, id_product, id_sucursal, id_storage, status, difference_observed
  FROM stock_reconciliation_cases
  WHERE status <> 'RESUELTA' AND id_sucursal = 1
), stock_current AS (
  SELECT id_product, id_sucursal, id_storage, SUM(stock) AS stock_balance
  FROM stocks
  WHERE status IS TRUE AND id_sucursal = 1
  GROUP BY id_product, id_sucursal, id_storage
), kardex_current AS (
  SELECT id_product, id_sucursal, id_storage,
    COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_balance
  FROM view_kardex_detalle
  WHERE date <= CURRENT_TIMESTAMP AND id_sucursal = 1
  GROUP BY id_product, id_sucursal, id_storage
)
SELECT c.id AS case_id, p.cod AS product_code, p.name AS product_name,
  c.id_sucursal, c.id_storage, c.status,
  COALESCE(s.stock_balance, 0) AS current_stock,
  COALESCE(k.kardex_balance, 0) AS current_kardex,
  COALESCE(s.stock_balance, 0) - COALESCE(k.kardex_balance, 0) AS current_difference
FROM open_cases c
JOIN products p ON p.id = c.id_product
LEFT JOIN stock_current s USING (id_product, id_sucursal, id_storage)
LEFT JOIN kardex_current k USING (id_product, id_sucursal, id_storage)
ORDER BY p.cod, c.id_sucursal, c.id_storage, c.id;

WITH open_notes AS (
  SELECT n.id, n.registry_number, n.type, n.reconciliation_status, n.id_product, n.id_sucursal, n.id_storage
  FROM transfer_review_notes n
  WHERE n.management_status = 'ACTIVA'
    AND n.id_sucursal = 1
    AND (n.reconciliation_status <> 'COMPLETADO' OR EXISTS (
      SELECT 1 FROM transfer_review_note_details d
      WHERE d.id_transfer_review_note = n.id AND d.reconciliation_status <> 'COMPLETADO'
    ))
)
SELECT n.id AS note_id, n.registry_number, n.type, n.reconciliation_status,
  n.id_product AS registered_product_id, n.id_sucursal, n.id_storage,
  COUNT(DISTINCT d.id) AS detail_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.reconciliation_status <> 'COMPLETADO') AS open_detail_count,
  COALESCE(SUM(h.quantity), 0) AS held_quantity,
  COUNT(DISTINCT a.id) AS resolution_action_count,
  COUNT(DISTINCT a.id) FILTER (
    WHERE a.management_status = 'ACTIVA'
      AND a.operation_mode = 'CREATED_AUTOMATICALLY'
      AND a.operation_status IN ('ACTIVE', 'PENDING_RECEPTION', 'REVERSAL_PENDING')
  ) AS active_automatic_action_count
FROM open_notes n
LEFT JOIN transfer_review_note_details d ON d.id_transfer_review_note = n.id
LEFT JOIN transfer_review_inventory_holds h ON h.id_transfer_review_note_detail = d.id
LEFT JOIN transfer_review_resolution_actions a ON a.id_transfer_review_note = n.id
GROUP BY n.id, n.registry_number, n.type, n.reconciliation_status, n.id_product, n.id_sucursal, n.id_storage
ORDER BY n.id;

WITH open_notes AS (
  SELECT n.id
  FROM transfer_review_notes n
  WHERE n.management_status = 'ACTIVA'
    AND n.id_sucursal = 1
    AND (n.reconciliation_status <> 'COMPLETADO' OR EXISTS (
      SELECT 1 FROM transfer_review_note_details d
      WHERE d.id_transfer_review_note = n.id AND d.reconciliation_status <> 'COMPLETADO'
    ))
)
SELECT
  (SELECT COUNT(*) FROM stock_reconciliation_cases WHERE status <> 'RESUELTA' AND id_sucursal = 1) AS open_stock_case_rows,
  (SELECT COUNT(*) FROM (
    SELECT id_product, id_sucursal, id_storage
    FROM stock_reconciliation_cases WHERE status <> 'RESUELTA' AND id_sucursal = 1
    GROUP BY id_product, id_sucursal, id_storage
  ) locations) AS open_stock_locations,
  (SELECT COUNT(DISTINCT id_product) FROM stock_reconciliation_cases WHERE status <> 'RESUELTA' AND id_sucursal = 1) AS open_stock_products,
  (SELECT COUNT(*) FROM open_notes) AS open_review_notes,
  (SELECT COUNT(*) FROM transfer_review_inventory_holds h
    JOIN transfer_review_note_details d ON d.id = h.id_transfer_review_note_detail
    JOIN open_notes n ON n.id = d.id_transfer_review_note) AS associated_holds,
  (SELECT COUNT(*) FROM transfer_review_resolution_actions a
    JOIN open_notes n ON n.id = a.id_transfer_review_note
    WHERE a.management_status = 'ACTIVA'
      AND a.operation_mode = 'CREATED_AUTOMATICALLY'
      AND a.operation_status IN ('ACTIVE', 'PENDING_RECEPTION', 'REVERSAL_PENDING')) AS active_automatic_actions;

-- Cuenta notas abiertas (filas), traslados distintos y ubicación para contrastar con la pantalla.
WITH open_notes AS (
  SELECT n.id, n.id_transfer, n.id_sucursal, n.id_storage
  FROM transfer_review_notes n
  WHERE n.management_status = 'ACTIVA'
    AND n.id_sucursal = 1
    AND (n.reconciliation_status <> 'COMPLETADO' OR EXISTS (
      SELECT 1 FROM transfer_review_note_details d
      WHERE d.id_transfer_review_note = n.id AND d.reconciliation_status <> 'COMPLETADO'
    ))
)
SELECT id_sucursal, id_storage,
  COUNT(*) AS open_note_rows,
  COUNT(DISTINCT id_transfer) AS distinct_transfer_boletas
FROM open_notes
GROUP BY id_sucursal, id_storage
ORDER BY id_sucursal, id_storage;

-- Muestra ubicaciones que se ajustarán, incluyendo filas Stock faltantes o duplicadas.
WITH kardex AS (
  SELECT id_product, id_sucursal, id_storage,
    COALESCE(SUM(quantity_input), 0) - COALESCE(SUM(quantity_output), 0) AS kardex_balance
  FROM view_kardex_detalle
  WHERE date <= CURRENT_TIMESTAMP AND id_sucursal = 1
  GROUP BY id_product, id_sucursal, id_storage
), active_stock AS (
  SELECT id_product, id_sucursal, id_storage,
    COUNT(*) AS active_stock_rows, SUM(stock) AS stock_balance
  FROM stocks
  WHERE status IS TRUE AND id_sucursal = 1
  GROUP BY id_product, id_sucursal, id_storage
), locations AS (
  SELECT id_product, id_sucursal, id_storage FROM kardex
  UNION
  SELECT id_product, id_sucursal, id_storage FROM active_stock
)
SELECT l.id_product, p.cod AS product_code, p.name AS product_name,
  l.id_sucursal, l.id_storage,
  COALESCE(s.active_stock_rows, 0) AS active_stock_rows,
  COALESCE(s.stock_balance, 0) AS stock_balance,
  COALESCE(k.kardex_balance, 0) AS kardex_balance,
  COALESCE(s.stock_balance, 0) - COALESCE(k.kardex_balance, 0) AS difference
FROM locations l
JOIN products p ON p.id = l.id_product
LEFT JOIN active_stock s USING (id_product, id_sucursal, id_storage)
LEFT JOIN kardex k USING (id_product, id_sucursal, id_storage)
WHERE COALESCE(s.active_stock_rows, 0) <> 1
   OR COALESCE(s.stock_balance, 0) IS DISTINCT FROM COALESCE(k.kardex_balance, 0)
ORDER BY p.cod, l.id_storage;

-- El resumen distingue filas de notas de boletas distintas: una boleta puede tener varias notas.
-- Si el detalle muestra más de una fila Stock activa por ubicación, el corte se detendrá.

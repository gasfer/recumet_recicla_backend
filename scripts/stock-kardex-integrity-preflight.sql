-- Read-only cut. Never creates balancing movements or releases holds.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT id, name, decimals, status FROM companies WHERE status = true;
SELECT table_name, column_name, numeric_precision, numeric_scale
FROM information_schema.columns WHERE table_schema = 'public'
AND table_name IN ('stocks', 'kardex_movements', 'details_transfers', 'transfer_review_inventory_holds')
AND column_name IN ('stock', 'quantity', 'quantity_received');
WITH detail AS (
  SELECT id_product,id_sucursal,id_storage,
    SUM(quantity_input)-SUM(quantity_output) AS balance
  FROM view_kardex_detalle GROUP BY id_product,id_sucursal,id_storage
), held AS (
  SELECT id_product,id_sucursal,id_storage,SUM(quantity) AS quantity
  FROM transfer_review_inventory_holds WHERE disposition <> 'LIBERADO_POR_AJUSTE'
  GROUP BY id_product,id_sucursal,id_storage
), locations AS (
  SELECT id_product,id_sucursal,id_storage FROM stocks WHERE status = true
  UNION SELECT id_product,id_sucursal,id_storage FROM detail
  UNION SELECT id_product,id_sucursal,id_storage FROM held
)
SELECT l.*, COALESCE(s.stock,0) AS stock, COALESCE(d.balance,0) AS kardex,
  COALESCE(s.stock,0)-COALESCE(d.balance,0) AS difference,
  COALESCE(h.quantity,0) AS held, COALESCE(s.stock,0)-COALESCE(h.quantity,0) AS available
FROM locations l
LEFT JOIN stocks s ON s.id_product=l.id_product AND s.id_sucursal=l.id_sucursal AND s.id_storage=l.id_storage AND s.status=true
LEFT JOIN detail d ON d.id_product=l.id_product AND d.id_sucursal=l.id_sucursal AND d.id_storage=l.id_storage
LEFT JOIN held h ON h.id_product=l.id_product AND h.id_sucursal=l.id_sucursal AND h.id_storage=l.id_storage
WHERE COALESCE(s.stock,0) <> COALESCE(d.balance,0)
   OR COALESCE(s.stock,0) < COALESCE(h.quantity,0)
ORDER BY l.id_product,l.id_sucursal,l.id_storage;
SELECT source_type,source_id,source_detail_id,effect_type,COUNT(*) AS effects
FROM kardex_movements WHERE status = true AND source_type IS NOT NULL
AND source_id IS NOT NULL AND source_detail_id IS NOT NULL AND effect_type IS NOT NULL
GROUP BY source_type,source_id,source_detail_id,effect_type HAVING COUNT(*) > 1;
SELECT n.id AS note_id,n.reconciliation_status,d.id AS detail_id,
  d.quantity_difference,d.quantity_resolved,
  COALESCE(SUM(h.quantity) FILTER (WHERE h.disposition <> 'LIBERADO_POR_AJUSTE'),0) AS held
FROM transfer_review_notes n JOIN transfer_review_note_details d ON d.id_transfer_review_note=n.id
LEFT JOIN transfer_review_inventory_holds h ON h.id_transfer_review_note_detail=d.id
WHERE n.reconciliation_status='COMPLETADO'
GROUP BY n.id,n.reconciliation_status,d.id,d.quantity_difference,d.quantity_resolved
HAVING d.quantity_difference <> d.quantity_resolved
OR COALESCE(SUM(h.quantity) FILTER (WHERE h.disposition <> 'LIBERADO_POR_AJUSTE'),0) <> 0;
ROLLBACK;

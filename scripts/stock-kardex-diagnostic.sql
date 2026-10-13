-- Consulta independiente de solo lectura para comparar Stock con el Kardex.
-- Ejecutar esta sentencia completa en una pestaña SQL nueva de DBeaver.
WITH kardex AS (
  SELECT
    vk.id_product,
    vk.id_sucursal,
    vk.id_storage,
    COALESCE(SUM(vk.quantity_input), 0) - COALESCE(SUM(vk.quantity_output), 0) AS kardex_historico,
    COUNT(*) AS movimientos,
    MAX(vk.date) AS ultimo_movimiento
  FROM view_kardex_detalle AS vk
  WHERE vk.date <= CURRENT_TIMESTAMP
  GROUP BY vk.id_product, vk.id_sucursal, vk.id_storage
), stock_activo AS (
  SELECT s.id_product, s.id_sucursal, s.id_storage, s.stock
  FROM stocks AS s
  WHERE s.status = TRUE
), ubicaciones AS (
  SELECT sa.id_product, sa.id_sucursal, sa.id_storage FROM stock_activo AS sa
  UNION
  SELECT k.id_product, k.id_sucursal, k.id_storage FROM kardex AS k
)
SELECT
  u.id_product,
  p.cod AS codigo,
  p.name AS producto,
  u.id_sucursal,
  suc.name AS sucursal,
  u.id_storage,
  alm.name AS almacen,
  COALESCE(sa.stock, 0) AS stock_actual,
  COALESCE(k.kardex_historico, 0) AS kardex_historico,
  COALESCE(sa.stock, 0) - COALESCE(k.kardex_historico, 0) AS diferencia,
  COALESCE(k.movimientos, 0) AS movimientos,
  k.ultimo_movimiento
FROM ubicaciones AS u
JOIN products AS p ON p.id = u.id_product
LEFT JOIN sucursals AS suc ON suc.id = u.id_sucursal
LEFT JOIN storages AS alm ON alm.id = u.id_storage
LEFT JOIN stock_activo AS sa
  ON sa.id_product = u.id_product
  AND sa.id_sucursal = u.id_sucursal
  AND sa.id_storage = u.id_storage
LEFT JOIN kardex AS k
  ON k.id_product = u.id_product
  AND k.id_sucursal = u.id_sucursal
  AND k.id_storage = u.id_storage
WHERE COALESCE(sa.stock, 0) <> COALESCE(k.kardex_historico, 0)
ORDER BY suc.name, alm.name, p.cod;

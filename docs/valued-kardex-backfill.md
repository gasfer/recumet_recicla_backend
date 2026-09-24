# Procedimiento de reconstrucción del Kardex valorado

## Regla de seguridad

La reconstrucción se ejecuta primero en modo `PREVIEW_ONLY`. Este modo lee `view_kardex_detalle` y `stocks`, calcula una secuencia valorada en memoria y comprueba que las tablas `valued_inventory_balances` y `valued_kardex_entries` conserven exactamente la misma cantidad de filas antes y después.

No se debe aplicar el backfill cuando existan diferencias físicas o movimientos sin una base de costo determinable. Un costo ausente nunca se reemplaza por cero.

## Previsualización

Desde `recumet_recicla_backend/`:

```text
npm run kardex:valued:preview
```

El resultado informa movimientos leídos, movimientos valorados, excepciones por código, diferencias contra stock y una muestra limitada sin datos personales.

## Resultado de caracterización del 15-09-2026

- Movimientos analizados: 51.118.
- Movimientos valorables con las fuentes actuales: 39.067.
- Movimientos no valorables: 12.051.
- Salidas sin base de costo anterior: 118.
- eventos que atraviesan un saldo histórico negativo: 11.905.
- discontinuidades contra el saldo expuesto por la vista: 28.
- ubicaciones cuyo saldo reconstruido difiere del stock activo: 91.
- Ubicaciones con stock actual distinto de cero: 319.
- Ubicaciones cuyo producto tiene `products.costo` mayor a cero: 17.
- Ubicaciones sin ese costo: 302.

La previsualización dejó cero filas en ambas tablas valoradas. Este resultado prueba que el historial disponible no contiene todos los saldos iniciales necesarios para reconstruir el costo desde el primer movimiento conservado.

## Resolución requerida antes de aplicar

Para cada combinación producto, sucursal y almacén afectada debe existir un asiento de apertura con:

1. fecha y documento de corte;
2. cantidad física aprobada;
3. costo promedio unitario aprobado;
4. usuario administrador responsable;
5. evidencia u observación de origen.

La cantidad puede verificarse contra `stocks.stock`. El costo debe provenir de una valoración aprobada; `products.costo` y `products_costs.cost_two/cost_tree` no se usarán automáticamente porque no representan de forma uniforme el costo promedio histórico.

## Aplicación

La aplicación idempotente sólo podrá habilitarse cuando la previsualización no tenga diferencias físicas para la ubicación y exista costo de apertura o una cadena histórica completa. Al repetirla con las mismas fuentes debe actualizar las mismas claves, sin insertar movimientos duplicados.

## Rollback

El rollback de aplicación deshabilita la lectura valorada pero conserva el libro generado para auditoría. Las tablas sólo pueden retirarse mediante la migración `down` antes de contener información aprobada. Nunca se elimina el historial operativo ni se modifica `stocks` como parte del rollback del Kardex valorado.

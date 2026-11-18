# Inicio de línea base Stock–Kardex

## Orden de ejecución

1. Desplegar la versión que registra la cantidad recibida en Stock y Kardex y consulta diferencias en vivo. Esta versión deja de crear nuevas notas de faltantes/sobrantes y casos Stock–Kardex.
2. Ejecutar las migraciones pendientes, incluida `20261116000000-preserve-kardex-projection-after-reconciliation-cleanup`. Confirmar que finalicen sin error.
3. En la base objetivo, ejecutar la consulta aprobada de conteo físico para igualar `stocks` y el saldo de `view_kardex_detalle`. Esta consulta operativa es independiente de los archivos de limpieza.
4. Ejecutar `stock-kardex-baseline-reset-preview.sql`. Revisar cada producto/ubicación, cada boleta, las reservas y las acciones automáticas. Después de igualar los saldos, puede haber 0 casos Stock–Kardex persistidos; el corte también admite las 37 ubicaciones revisadas originalmente. Confirmar las 45 boletas abiertas y que no haya acciones automáticas activas.
5. Con la aplicación sin operaciones de inventario en curso, ejecutar `stock-kardex-baseline-reset-apply.sql` en una sesión PostgreSQL. El script exige paridad Stock–Kardex para todas las ubicaciones objetivo; cualquier conteo o verificación distinto provoca rollback.
6. Revisar el resultado de confirmación y consultar nuevamente `/kardex/diagnostic`. Confirmar diferencia cero en la línea base y cero expedientes/reservas abiertos objetivo.

## Alcance del corte

El script elimina solo casos Stock–Kardex no resueltos y notas de revisión activas incompletas, junto con sus eventos, evidencias, decisiones, autorizaciones, acciones, enlaces, completaciones y reservas dependientes. Conserva las notas completadas y las filas fuente de traslados, sus detalles, Stock y movimientos de Kardex. No ejecuta cambios de saldo.

El número 37 surgió del diagnóstico de saldos y no implica que existan 37 filas persistidas en `stock_reconciliation_cases`: la consulta de igualación solo actualiza `stocks`. Por eso, 0 casos persistidos es válido una vez igualados los saldos; 45 corresponde a boletas activas incompletas. Si la previsualización presenta otras cantidades de boletas o filas inesperadas, no ejecutar el corte hasta revisar la causa y actualizar deliberadamente el alcance aprobado.

## Instalaciones nuevas y bases existentes

Las migraciones `20260820001000-backfill-transfer-review-events` y `20260825000000-create-transfer-review-inventory-holds` conservan su estructura, pero ya no crean eventos `MIGRADA` ni reservas derivadas de notas anteriores. Editar una migración ya ejecutada no cambia una base existente; el script manual de corte es el que limpia los datos presentes en esa base. Las migraciones no se deben volver a ejecutar ni revertir manualmente.

El script de aplicación requiere una ventana sin escrituras concurrentes de inventario. Mantener el respaldo operativo habitual de la base antes de ejecutar una eliminación permanente de expedientes.

La migración Kardex ahora registra la etapa que ejecuta, aborta si espera más de 8 segundos por un bloqueo y revierte si una sentencia supera 180 segundos. Si el proceso ya estaba colgado antes de desplegar esta versión, interrumpir esa ejecución y dejar que PostgreSQL revierta su transacción antes de reintentar con el backend detenido.

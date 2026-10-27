# Agente local para la balanza camionera

Este servicio permite que RECUMET alojado en la nube lea una balanza accesible desde la PC de la misma red. Se ejecuta en la PC que abrirá RECUMET y se conecta por TCP a `192.168.0.240:8000`.

El agente no aloja el ERP, no requiere XAMPP ni publica puertos en la red. Escucha únicamente en `127.0.0.1:4180`: el navegador y el agente deben estar en la misma computadora. No configures el agente en la IP de la PC; la conexión local se hace por loopback.

## Requisitos

- Windows en la PC que está conectada a la red de la balanza.
- Node.js 18 o superior en esa PC.
- Acceso TCP desde esa PC a `192.168.0.240:8000` (o al host y puerto configurados para el equipo).
- Acceso del navegador al sitio local cuando el navegador lo solicite.

No requiere instalar paquetes npm.

## Inicio manual

Haz doble clic en `iniciar-lector-balanza.cmd` y deja abierta su ventana mientras uses el pesaje. El lanzador configura los orígenes admitidos y evita abrir una segunda instancia si el agente ya responde.

Para confirmar que está activo, abre `http://127.0.0.1:4180/health` en esa misma PC. Debe responder `{"ok":true,"service":"truck-scale-local-agent"}`. Para detenerlo, cierra la ventana del agente.

El host, puerto TCP de la balanza y puerto local del agente se configuran al inicio de `iniciar-lector-balanza.cmd`.

## Inicio automático al iniciar sesión

El inicio automático es opcional y no se instala al abrir el agente:

1. Ejecuta `habilitar-inicio-automatico-balanza.bat` una vez. Registra o actualiza una tarea de Windows para el usuario actual, sin crear duplicados.
2. La tarea se ejecutará al iniciar sesión en Windows. Para usar el agente inmediatamente, inicia también `iniciar-lector-balanza.cmd`.
3. Para quitar el inicio automático, ejecuta `deshabilitar-inicio-automatico-balanza.bat`. Esto elimina solo la tarea y conserva los archivos.

La tarea usa la sesión del usuario conectado y muestra la ventana del agente para facilitar el diagnóstico. No se necesita ejecutar el archivo como administrador. Si mueves esta carpeta, vuelve a ejecutar el archivo de habilitación para actualizar la ruta guardada.

## Dominios autorizados

El agente acepta solicitudes de lectura desde estos orígenes HTTPS exactos:

- `https://recicla.recumetbolivia.com`
- `https://recicladev.recumetbolivia.com`

Los dos orígenes se configuran en el lanzador y también son los valores predeterminados del servidor. Si `TRUCK_SCALE_ALLOWED_ORIGINS` se define externamente, su valor reemplaza la lista predeterminada; separa varios orígenes con comas y no agregues rutas ni una barra final. Otros dominios no están autorizados.

La aplicación consulta `http://127.0.0.1:4180/read-weight`. Si el navegador solicita permiso para que el sitio acceda a la red local, permítelo. Esa autorización del navegador es independiente del permiso del usuario para abrir módulos RECUMET.

## Diagnóstico

1. **El endpoint `/health` no responde o muestra `ERR_CONNECTION_REFUSED`:** el agente no está iniciado en esa PC, o el puerto local no coincide. Inicia el `.cmd` y vuelve a consultar `/health`.
2. **`/health` responde, pero la solicitud de RECUMET devuelve `403`:** el origen del sitio no coincide con la lista autorizada. Revisa el dominio en la barra del navegador y la variable `TRUCK_SCALE_ALLOWED_ORIGINS`.
3. **El agente responde `503` al leer:** revisa la conexión TCP, el host y el puerto de la balanza. Desde PowerShell puedes ejecutar `Test-NetConnection 192.168.0.240 -Port 8000`; `TcpTestSucceeded` debe ser `True`. Un ping exitoso por sí solo no confirma que el puerto TCP esté disponible.
4. **El navegador informa estado 0 aunque `/health` responde:** revisa el permiso de acceso a red local del navegador para el sitio RECUMET.

Al actualizar el agente, cierra la ventana de la instancia anterior e inicia el nuevo `iniciar-lector-balanza.cmd` para que tome la configuración actualizada. Después puedes volver a habilitar el inicio automático; la tarea existente se actualizará.

## Desarrollo local

En desarrollo, el frontend sigue consultando `http://localhost:3000/api/v1/scale/read-weight`; el backend local lee la balanza usando `TRUCK_SCALE_HOST` y `TRUCK_SCALE_PORT`.

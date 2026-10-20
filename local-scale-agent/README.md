# Agente local para la balanza camionera

Este servicio permite que RECUMET alojado en Dockploy lea una balanza accesible desde una PC de la misma red. Se ejecuta en la PC que abre RECUMET y conecta por TCP a `192.168.0.240:8000`.

No aloja el ERP, no requiere XAMPP y no publica puertos en la red. Escucha únicamente en `127.0.0.1:4180`; no es necesario configurar el agente en la IP de la PC (`192.168.0.105`) porque el navegador y el agente funcionan en esa misma computadora.

## Requisito

Instala Node.js 18 o superior en la PC que leerá la balanza. No requiere instalar paquetes npm.

## Iniciar en Windows

Haz doble clic en `iniciar-lector-balanza.cmd` y deja abierta la ventana mientras uses la función de pesaje. Para comprobar que arrancó, abre `http://127.0.0.1:4180/health`; debe mostrar `{"ok":true,...}`.

La PC debe poder conectarse a `192.168.0.240` por el puerto TCP `8000`. Si el equipo usa otra IP o puerto, cambia las variables al inicio del archivo `.cmd`.

## RECUMET en Dockploy

El frontend de producción consulta `http://127.0.0.1:4180/read-weight`. El agente solo acepta solicitudes del origen `https://recicladev.recumetbolivia.com`. Si el dominio del ERP cambia, inicia el agente con `TRUCK_SCALE_ALLOWED_ORIGINS` configurado con el origen HTTPS exacto, sin ruta final.

La primera vez, Chrome puede pedir permiso para que el sitio acceda a la red local. Debes permitirlo para leer el peso.

## Desarrollo local

El entorno de desarrollo sigue consultando `http://localhost:3000/api/v1/scale/read-weight`, de modo que el backend local puede leer la balanza directamente cuando corre en la misma PC.

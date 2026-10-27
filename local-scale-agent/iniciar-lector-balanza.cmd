@echo off
set "TRUCK_SCALE_HOST=192.168.0.240"
set "TRUCK_SCALE_PORT=8000"
set "TRUCK_SCALE_AGENT_PORT=4180"
set "TRUCK_SCALE_ALLOWED_ORIGINS=https://recicla.recumetbolivia.com,https://recicladev.recumetbolivia.com"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4180/health' -TimeoutSec 2; if ($health.ok) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
    echo El agente local RECUMET ya esta activo en http://127.0.0.1:4180.
    exit /b 0
)

node "%~dp0server.js"
if errorlevel 1 pause

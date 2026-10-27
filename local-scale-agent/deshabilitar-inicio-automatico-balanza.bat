@echo off
setlocal

set "TRUCK_SCALE_TASK_NAME=RECUMET Truck Scale Local Agent"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Unregister-ScheduledTask -TaskName $env:TRUCK_SCALE_TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'Inicio automatico deshabilitado. Los archivos del agente se conservaron.'; exit 0 } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
    echo No se pudo retirar la tarea de inicio automatico.
    pause
    exit /b 1
)

pause
exit /b 0

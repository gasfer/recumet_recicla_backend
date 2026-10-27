@echo off
setlocal

set "TRUCK_SCALE_TASK_NAME=RECUMET Truck Scale Local Agent"
set "TRUCK_SCALE_AGENT_SCRIPT=%~dp0iniciar-lector-balanza.cmd"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { $script = $env:TRUCK_SCALE_AGENT_SCRIPT; if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw ('No se encontro el lanzador: ' + $script) }; $taskName = $env:TRUCK_SCALE_TASK_NAME; $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name; $workingDirectory = Split-Path -Parent $script; $arguments = '/c ' + [char]34 + [char]34 + $script + [char]34 + [char]34; $action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument $arguments -WorkingDirectory $workingDirectory; $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user; $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited; $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero); Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null; Write-Host ('Inicio automatico habilitado para ' + $user + '. Se ejecutara al iniciar sesion.'); exit 0 } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
    echo No se pudo habilitar el inicio automatico.
    pause
    exit /b 1
)

echo La tarea se actualizo sin duplicarla. El agente se iniciara al proximo inicio de sesion.
pause
exit /b 0

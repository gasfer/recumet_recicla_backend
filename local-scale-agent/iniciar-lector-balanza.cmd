@echo off
set "TRUCK_SCALE_HOST=192.168.0.240"
set "TRUCK_SCALE_PORT=8000"
set "TRUCK_SCALE_AGENT_PORT=4180"
node "%~dp0server.js"
if errorlevel 1 pause

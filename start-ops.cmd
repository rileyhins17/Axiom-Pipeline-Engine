@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -ExecutionPolicy Bypass -File "%~dp0start-ops.ps1"

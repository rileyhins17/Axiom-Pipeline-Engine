@echo off
cd /d "%~dp0"
start "" powershell.exe -WindowStyle Hidden -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\worker-desktop.ps1"

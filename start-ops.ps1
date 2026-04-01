Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$desktopScript = Join-Path $PSScriptRoot "scripts\worker-desktop.ps1"
& $desktopScript

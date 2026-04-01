Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tsxPath = Join-Path $PSScriptRoot "node_modules\.bin\tsx.cmd"
$studioScript = Join-Path $PSScriptRoot "scripts\worker-studio.ts"
$studioScriptRel = "scripts\worker-studio.ts"
$powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

if (Test-Path -LiteralPath $tsxPath) {
    Start-Process -FilePath $tsxPath -ArgumentList @("`"$studioScript`"") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null
    return
}

Start-Process -FilePath $powershellPath -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "npx --yes tsx $studioScriptRel"
) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden | Out-Null

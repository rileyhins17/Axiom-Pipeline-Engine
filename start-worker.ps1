Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return [System.Environment]::GetEnvironmentVariable($Name, "Process")
}

function Import-WorkerEnvFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()

        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $existing = Get-EnvValue -Name $name
        if ([string]::IsNullOrWhiteSpace($existing)) {
            Set-Item "Env:$name" $value
        }
    }
}

function Test-WorkerValue {
    param(
        [AllowEmptyString()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    if ($Value -match '^<[^>]+>$') {
        return $false
    }

    return $true
}

$workerEnvPath = Join-Path $PSScriptRoot ".env.worker"
$workerEnvExamplePath = Join-Path $PSScriptRoot ".env.worker.example"
$devVarsPath = Join-Path $PSScriptRoot ".dev.vars"
if ((-not (Test-Path -LiteralPath $workerEnvPath)) -and (Test-Path -LiteralPath $workerEnvExamplePath)) {
    Copy-Item -LiteralPath $workerEnvExamplePath -Destination $workerEnvPath
    Write-Host "Created .env.worker from .env.worker.example. Fill in the local secret values before starting the worker." -ForegroundColor Yellow
    Start-Process -FilePath "notepad.exe" -ArgumentList $workerEnvPath | Out-Null
}

Import-WorkerEnvFile -Path $workerEnvPath
Import-WorkerEnvFile -Path $devVarsPath
$defaultControlPlaneUrl = "https://operations.getaxiom.ca"

$controlPlaneUrl = Get-EnvValue -Name "CONTROL_PLANE_URL"
if ([string]::IsNullOrWhiteSpace($controlPlaneUrl)) {
    $controlPlaneUrl = Get-EnvValue -Name "APP_BASE_URL"
}

if ([string]::IsNullOrWhiteSpace($controlPlaneUrl) -or $controlPlaneUrl -match '^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$') {
    $controlPlaneUrl = $defaultControlPlaneUrl
}

$env:APP_BASE_URL = $controlPlaneUrl
$env:CONTROL_PLANE_URL = $controlPlaneUrl

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "WORKER_NAME"))) {
    $env:WORKER_NAME = "local-worker"
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "AGENT_NAME"))) {
    $env:AGENT_NAME = $env:WORKER_NAME
}

$required = @("APP_BASE_URL", "AGENT_SHARED_SECRET")
$missing = @()
foreach ($name in $required) {
    $value = Get-EnvValue -Name $name
    if (-not (Test-WorkerValue -Value $value)) {
        $missing += $name
    }
}

if ($missing.Count -gt 0) {
    if (Test-Path -LiteralPath $workerEnvPath) {
        Start-Process -FilePath "notepad.exe" -ArgumentList $workerEnvPath | Out-Null
    }
    throw "Missing required environment variable(s): $($missing -join ', '). Create a local .env.worker file from .env.worker.example and fill in the values."
}

$tsxPath = Join-Path $PSScriptRoot "node_modules\.bin\tsx.cmd"
$workerScript = Join-Path $PSScriptRoot "scripts\local-scrape-worker.ts"
$workerScriptRel = "scripts\local-scrape-worker.ts"
$powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"

if (Test-Path -LiteralPath $tsxPath) {
    $workerProcess = Start-Process -FilePath $tsxPath -ArgumentList @($workerScript) -PassThru -NoNewWindow -WorkingDirectory $PSScriptRoot
} else {
    $workerProcess = Start-Process -FilePath $powershellPath -ArgumentList @(
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "npx --yes tsx $workerScriptRel"
    ) -PassThru -NoNewWindow -WorkingDirectory $PSScriptRoot
}

$pidFile = Join-Path $PSScriptRoot ".worker.pid"
Set-Content -LiteralPath $pidFile -Value $workerProcess.Id -NoNewline

try {
    Wait-Process -Id $workerProcess.Id
} finally {
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

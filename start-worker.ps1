Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

        $existing = (Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value
        if ([string]::IsNullOrWhiteSpace($existing)) {
            Set-Item "Env:$name" $value
        }
    }
}

function Get-EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return [System.Environment]::GetEnvironmentVariable($Name, "Process")
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
Import-WorkerEnvFile -Path $workerEnvPath
$defaultControlPlaneUrl = "https://operations.getaxiom.ca"

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "APP_BASE_URL"))) {
    $env:APP_BASE_URL = Get-EnvValue -Name "CONTROL_PLANE_URL"
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "APP_BASE_URL"))) {
    $env:APP_BASE_URL = $defaultControlPlaneUrl
}

if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Name "CONTROL_PLANE_URL"))) {
    $env:CONTROL_PLANE_URL = $env:APP_BASE_URL
}

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
    throw "Missing required environment variable(s): $($missing -join ', '). Create a local .env.worker file from .env.worker.example and fill in the values."
}

$workerProcess = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "worker") -PassThru -NoNewWindow
$pidFile = Join-Path $PSScriptRoot ".worker.pid"
Set-Content -LiteralPath $pidFile -Value $workerProcess.Id -NoNewline

try {
    Wait-Process -Id $workerProcess.Id
} finally {
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

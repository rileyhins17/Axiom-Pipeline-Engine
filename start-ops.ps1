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

function Escape-PowerShellSingleQuotedString {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return $Value.Replace("'", "''")
}

$workerEnvFile = Join-Path $PSScriptRoot ".env.worker"
Import-WorkerEnvFile -Path $workerEnvFile
$defaultAppUrl = "https://operations.getaxiom.ca"

$appUrl = Get-EnvValue -Name "APP_BASE_URL"
if ([string]::IsNullOrWhiteSpace($appUrl)) {
    $appUrl = Get-EnvValue -Name "CONTROL_PLANE_URL"
}

if ([string]::IsNullOrWhiteSpace($appUrl)) {
    $appUrl = $defaultAppUrl
}

$workerScript = Join-Path $PSScriptRoot "start-worker.ps1"
$workerScriptLiteral = Escape-PowerShellSingleQuotedString -Value $workerScript
$workerCommand = @"
try {
    & '$workerScriptLiteral'
}
catch {
    Write-Host ""
    Write-Host "Worker failed to start." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Read-Host "Press Enter to close this window"
"@

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoLogo",
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $workerCommand
) -WorkingDirectory $PSScriptRoot | Out-Null

Start-Process $appUrl | Out-Null

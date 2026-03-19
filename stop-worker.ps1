Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pidFile = Join-Path $PSScriptRoot ".worker.pid"

function Get-LocalWorkerProcessId {
    if (Test-Path -LiteralPath $pidFile) {
        $rawPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($rawPid -match "^\d+$") {
            return [int]$rawPid
        }
    }

    $process = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -match "start-worker\.ps1" -or
            $_.CommandLine -match "local-scrape-worker\.ts" -or
            $_.CommandLine -match "npm run worker" -or
            $_.CommandLine -match "tsx scripts/local-scrape-worker\.ts"
        } |
        Select-Object -First 1

    if ($process) {
        return [int]$process.ProcessId
    }

    return $null
}

$workerPid = Get-LocalWorkerProcessId

if (-not $workerPid) {
    Write-Host "No local worker process found."
    exit 0
}

try {
    taskkill /PID $workerPid /T /F | Out-Null
    Write-Host "Stopped local worker process $workerPid."
} finally {
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

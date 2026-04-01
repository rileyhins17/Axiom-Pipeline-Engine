Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pidFile = Join-Path $PSScriptRoot ".worker.pid"

function Get-LocalWorkerProcessIds {
    $ids = New-Object System.Collections.Generic.List[int]

    if (Test-Path -LiteralPath $pidFile) {
        $rawPid = (Get-Content -LiteralPath $pidFile -Raw).Trim()
        if ($rawPid -match "^\d+$") {
            [void]$ids.Add([int]$rawPid)
        }
    }

    $processes = Get-CimInstance Win32_Process |
        Where-Object {
            $line = [string]$_.CommandLine
            -not [string]::IsNullOrWhiteSpace($line) -and (
                $line -match "local-scrape-worker\.ts" -or
                $line -match "start-worker\.ps1" -or
                $line -match "npm(\.cmd)?\s+run\s+worker(:local)?" -or
                $line -match "tsx(\.cmd)?\s+scripts[\\/]local-scrape-worker\.ts"
            )
        } |
        Select-Object ProcessId

    foreach ($process in $processes) {
        if ($null -ne $process.ProcessId) {
            $processId = [int]$process.ProcessId
            if ($processId -gt 0 -and $processId -ne $PID -and -not $ids.Contains($processId)) {
                [void]$ids.Add($processId)
            }
        }
    }

    return $ids
}

$workerPids = Get-LocalWorkerProcessIds

if (-not $workerPids -or $workerPids.Count -eq 0) {
    Write-Host "No local worker process found."
    exit 0
}

try {
    foreach ($workerPid in $workerPids) {
        try {
            taskkill /PID $workerPid /T /F | Out-Null
            Write-Host "Stopped local worker process $workerPid."
        } catch {
            Write-Warning "Failed to stop process $workerPid. $_"
        }
    }
} finally {
    if (Test-Path -LiteralPath $pidFile) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
}

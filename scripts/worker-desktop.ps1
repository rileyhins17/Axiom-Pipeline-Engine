Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:configDir = Join-Path $env:APPDATA "AxiomWorker"
$script:configPath = Join-Path $script:configDir "studio.json"
$script:repoRoot = $null
$script:backendLauncher = $null
$script:logoPath = $null
$script:logoControl = $null

function Load-StudioConfig {
    if (-not (Test-Path -LiteralPath $script:configPath)) {
        return @{}
    }
    try {
        $raw = Get-Content -LiteralPath $script:configPath -Raw
        if (-not $raw) { return @{} }
        return $raw | ConvertFrom-Json
    } catch {
        return @{}
    }
}

function Save-StudioConfig {
    param(
        [Parameter(Mandatory = $true)]
        $Config
    )

    if (-not (Test-Path -LiteralPath $script:configDir)) {
        New-Item -ItemType Directory -Path $script:configDir -Force | Out-Null
    }
    $payload = $Config | ConvertTo-Json -Depth 4
    Set-Content -LiteralPath $script:configPath -Value $payload -Encoding UTF8 -NoNewline
}

function Get-StudioConfigValue {
    param(
        [Parameter(Mandatory = $true)]
        $Config,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($null -eq $Config) {
        return $null
    }

    if ($Config -is [hashtable]) {
        if ($Config.ContainsKey($Name)) {
            return $Config[$Name]
        }
        return $null
    }

    $property = $Config.PSObject.Properties[$Name]
    if ($property) {
        return $property.Value
    }

    return $null
}

function Set-StudioConfigValue {
    param(
        [Parameter(Mandatory = $true)]
        $Config,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [object]$Value
    )

    if ($Config -is [hashtable]) {
        $Config[$Name] = $Value
        return $Config
    }

    if ($null -eq $Config) {
        $Config = [pscustomobject]@{}
    }

    $property = $Config.PSObject.Properties[$Name]
    if ($property) {
        $property.Value = $Value
    } else {
        $Config | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    }

    return $Config
}

function Test-RepoRoot {
    param(
        [AllowEmptyString()]
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    $pkg = Join-Path $Path "package.json"
    $worker = Join-Path $Path "scripts\local-scrape-worker.ts"
    return (Test-Path -LiteralPath $pkg) -and (Test-Path -LiteralPath $worker)
}

function Select-RepoRoot {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Select the the-omniscient repository folder."
    $dialog.ShowNewFolderButton = $false
    $result = $dialog.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK -and (Test-RepoRoot -Path $dialog.SelectedPath)) {
        return $dialog.SelectedPath
    }
    return $null
}

function Resolve-RepoRoot {
    $config = Load-StudioConfig
    $fromConfig = $null
    $configRepoRoot = Get-StudioConfigValue -Config $config -Name "repoRoot"
    if (-not [string]::IsNullOrWhiteSpace([string]$configRepoRoot)) {
        $fromConfig = [string]$configRepoRoot
    }
    if (Test-RepoRoot -Path $fromConfig) {
        return $fromConfig
    }

    $fromScript = Split-Path -Parent $PSScriptRoot
    if (Test-RepoRoot -Path $fromScript) {
        return $fromScript
    }

    $selected = Select-RepoRoot
    if ($selected) {
        return $selected
    }

    throw "Could not locate the repository. Please select the the-omniscient folder."
}

function Set-RepoRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-RepoRoot -Path $Path)) {
        throw "Selected folder does not look like the-omniscient."
    }

    $script:repoRoot = $Path
    $script:backendLauncher = Join-Path $script:repoRoot "worker-studio.ps1"
    $script:logoPath = Join-Path $script:repoRoot "public\axiomtransparentlogo.png"
    $script:launcherIconPath = Ensure-LauncherIcon

    $config = Load-StudioConfig
    $config = Set-StudioConfigValue -Config $config -Name "repoRoot" -Value $script:repoRoot
    Save-StudioConfig -Config $config

    if ($script:logoControl -and (Test-Path -LiteralPath $script:logoPath)) {
        try {
            if ($script:logoControl.Image) {
                $script:logoControl.Image.Dispose()
            }
        } catch {}
        $script:logoControl.Image = [System.Drawing.Image]::FromFile($script:logoPath)
    }
}

function Sanitize-WorkerName {
    param(
        [AllowEmptyString()]
        [string]$Value
    )

    $cleaned = [string]$Value
    $cleaned = $cleaned.Trim()
    $cleaned = $cleaned -replace "[^A-Za-z0-9._-]", "-"
    $cleaned = $cleaned -replace "^-+", ""
    $cleaned = $cleaned -replace "-+$", ""
    if ([string]::IsNullOrWhiteSpace($cleaned)) {
        return "local-worker"
    }
    return $cleaned
}

function Ensure-WorkerEnvFile {
    $envPath = Join-Path $script:repoRoot ".env.worker"
    $examplePath = Join-Path $script:repoRoot ".env.worker.example"
    if (Test-Path -LiteralPath $envPath) {
        return $envPath
    }
    if (Test-Path -LiteralPath $examplePath) {
        Copy-Item -LiteralPath $examplePath -Destination $envPath -Force
        return $envPath
    }
    New-Item -ItemType File -Path $envPath -Force | Out-Null
    return $envPath
}

function Set-EnvVarInFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [AllowEmptyString()]
        [string]$Value
    )

    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = Get-Content -LiteralPath $Path
    }

    $matched = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*${Name}\s*=") {
            $lines[$i] = "$Name=$Value"
            $matched = $true
        }
    }

    if (-not $matched) {
        $lines += "$Name=$Value"
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Set-WorkerNamePersisted {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $cleaned = Sanitize-WorkerName -Value $Value
    $envPath = Ensure-WorkerEnvFile
    Set-EnvVarInFile -Path $envPath -Name "WORKER_NAME" -Value $cleaned
    Set-EnvVarInFile -Path $envPath -Name "AGENT_NAME" -Value $cleaned

    $config = Load-StudioConfig
    $config = Set-StudioConfigValue -Config $config -Name "workerName" -Value $cleaned
    Save-StudioConfig -Config $config

    return $cleaned
}

function Ensure-LauncherIcon {
    if (-not (Test-Path -LiteralPath $script:logoPath)) {
        return $null
    }

    if (-not (Test-Path -LiteralPath $script:configDir)) {
        New-Item -ItemType Directory -Path $script:configDir -Force | Out-Null
    }

    $iconPath = Join-Path $script:configDir "axiom-launcher.ico"
    $rebuild = -not (Test-Path -LiteralPath $iconPath)
    if (-not $rebuild) {
        try {
            $logoInfo = Get-Item -LiteralPath $script:logoPath
            $iconInfo = Get-Item -LiteralPath $iconPath
            $rebuild = $logoInfo.LastWriteTimeUtc -gt $iconInfo.LastWriteTimeUtc
        } catch {
            $rebuild = $true
        }
    }

    if ($rebuild) {
        $pngBytes = [System.IO.File]::ReadAllBytes($script:logoPath)
        $stream = New-Object System.IO.MemoryStream
        $writer = New-Object System.IO.BinaryWriter($stream)
        try {
            $writer.Write([UInt16]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]1)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$pngBytes.Length)
            $writer.Write([UInt32]22)
            $writer.Write($pngBytes)
            $writer.Flush()
            [System.IO.File]::WriteAllBytes($iconPath, $stream.ToArray())
        } finally {
            $writer.Dispose()
            $stream.Dispose()
        }
    }

    return $iconPath
}

$script:repoRoot = Resolve-RepoRoot
Set-RepoRoot -Path $script:repoRoot
$backendBaseUrl = "http://127.0.0.1:4799"
$healthUrl = "$backendBaseUrl/healthz"
$stateUrl = "$backendBaseUrl/api/state"
$startUrl = "$backendBaseUrl/api/start"
$stopUrl = "$backendBaseUrl/api/stop"
$preflightUrl = "$backendBaseUrl/api/preflight"
$shutdownUrl = "$backendBaseUrl/api/shutdown"
$liveUrl = "https://operations.getaxiom.ca/hunt"

$script:currentState = $null
$script:refreshBusy = $false
$script:actionBusy = $false

function Test-BackendReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-HiddenPowerShell {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,

        [string[]]$Arguments = @()
    )

    if (-not (Test-Path -LiteralPath $script:configDir)) {
        New-Item -ItemType Directory -Path $script:configDir -Force | Out-Null
    }

    $vbsPath = Join-Path $script:configDir "launch-hidden-backend.vbs"
    $powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $argList = @(
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        $ScriptPath
    ) + $Arguments

    $escaped = ('"' + $powershellPath + '" ' + (($argList | ForEach-Object {
        if ($_ -match '\s' -or $_ -match '"') {
            '"' + ($_ -replace '"', '""') + '"'
        } else {
            $_
        }
    }) -join ' '))

    $vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$($WorkingDirectory -replace '"', '""')"
shell.Run "$($escaped -replace '"', '""')", 0, False
"@
    Set-Content -LiteralPath $vbsPath -Value $vbs -Encoding ASCII

    $wscriptPath = Join-Path $env:WINDIR "System32\wscript.exe"
    Start-Process -FilePath $wscriptPath -ArgumentList @("//B", "//NoLogo", "`"$vbsPath`"") -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

function Start-BackendIfNeeded {
    if (Test-BackendReady) {
        return
    }

    if (-not (Test-Path -LiteralPath $script:backendLauncher)) {
        throw "Worker backend launcher not found at $script:backendLauncher."
    }

    $previous = [System.Environment]::GetEnvironmentVariable("WORKER_STUDIO_OPEN_BROWSER", "Process")
    [System.Environment]::SetEnvironmentVariable("WORKER_STUDIO_OPEN_BROWSER", "0", "Process")
    try {
        Start-HiddenPowerShell -ScriptPath $script:backendLauncher -WorkingDirectory $script:repoRoot
    } finally {
        [System.Environment]::SetEnvironmentVariable("WORKER_STUDIO_OPEN_BROWSER", $previous, "Process")
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-BackendReady) {
            return
        }
        Start-Sleep -Milliseconds 300
    }

    throw "Worker backend did not start in time."
}

function Invoke-BackendJson {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("GET", "POST")]
        [string]$Method,

        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    if ($Method -eq "POST") {
        $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -TimeoutSec 10
        if ($response.Content) {
            return $response.Content | ConvertFrom-Json
        }
        return $null
    }

    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $Url -TimeoutSec 10
    if (-not $response.Content) {
        return $null
    }

    return $response.Content | ConvertFrom-Json
}

function Short-Url {
    param([string]$Value)
    try {
        return ([System.Uri]$Value).Host
    } catch {
        return ($Value -replace '^https?://', '')
    }
}

function Format-TimeValue {
    param([object]$Value)
    if (-not $Value) {
        return "Never"
    }

    try {
        return [DateTime]::Parse($Value.ToString()).ToLocalTime().ToString("h:mm:ss tt")
    } catch {
        return $Value.ToString()
    }
}

function Format-LogLine {
    param(
        [Parameter(Mandatory = $true)]
        $Entry
    )

    $time = Format-TimeValue -Value $Entry.timestamp
    $message = [string]$Entry.message
    return "$time  $message"
}

function Get-DesktopFolder {
    if (-not [string]::IsNullOrWhiteSpace($env:OneDrive)) {
        $oneDriveDesktop = Join-Path $env:OneDrive "Desktop"
        if (Test-Path -LiteralPath $oneDriveDesktop) {
            return $oneDriveDesktop
        }
    }

    $userProfile = [string]$env:USERPROFILE
    if ([string]::IsNullOrWhiteSpace($userProfile)) {
        return $env:HOME
    }

    $userDesktop = Join-Path $userProfile "Desktop"
    if (Test-Path -LiteralPath $userDesktop) {
        return $userDesktop
    }

    return $userProfile
}

function Create-DesktopLauncher {
    $desktopPath = Get-DesktopFolder
    $launcherPath = Join-Path $desktopPath "Axiom Worker.lnk"
    $vbsPath = Join-Path $script:configDir "launch-worker.vbs"
    $scriptPath = Join-Path $script:repoRoot "scripts\worker-desktop.ps1"
    $powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $iconPath = Ensure-LauncherIcon

    if (-not (Test-Path -LiteralPath $script:configDir)) {
        New-Item -ItemType Directory -Path $script:configDir -Force | Out-Null
    }

    $command = '"' + $powershellPath + '" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '"'
    $vbsPayload = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "$($command.Replace('"', '""'))", 0, False
"@
    Set-Content -LiteralPath $vbsPath -Value $vbsPayload -Encoding ASCII

    $wscriptPath = Join-Path $env:WINDIR "System32\wscript.exe"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($launcherPath)
    $shortcut.TargetPath = $wscriptPath
    $shortcut.Arguments = """$vbsPath"""
    $shortcut.WorkingDirectory = $script:repoRoot
    $shortcut.Description = "Axiom Worker"
    if ($iconPath) {
        $shortcut.IconLocation = "$iconPath,0"
    }
    $shortcut.Save()

    return $launcherPath
}

function Set-FormBrandIcon {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Forms.Form]$Form,

        [Parameter(Mandatory = $true)]
        [string]$IconPath
    )

    if (-not (Test-Path -LiteralPath $IconPath)) {
        return
    }

    try {
        $icon = New-Object System.Drawing.Icon($IconPath)
        $Form.Icon = $icon
        $script:windowIcon = $icon
    } catch {
    }
}

function Update-VisualState {
    param(
        [Parameter(Mandatory = $true)]
        $State
    )

    $worker = $State.worker
    $status = if ($worker.status) { [string]$worker.status } else { "idle" }

    if ($State.config -and $State.config.workerName) {
        $script:publishedWorkerName = [string]$State.config.workerName
    }

    switch ($status) {
        "running" {
            $statusBadge.Text = "LIVE"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(18, 84, 56)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(188, 255, 233)
            $toggleButton.Text = "Stop worker"
            $toggleButton.BackColor = [System.Drawing.Color]::FromArgb(22, 84, 63)
            $toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(233, 255, 245)
            $headline.Text = "Worker online."
            $subtitle.Text = "Connected to operations.getaxiom.ca."
        }
        "starting" {
            $statusBadge.Text = "STARTING"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
            $toggleButton.Text = "Starting..."
            $toggleButton.BackColor = [System.Drawing.Color]::FromArgb(74, 62, 18)
            $toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(255, 239, 198)
            $headline.Text = "Starting worker."
            $subtitle.Text = "The backend is spinning up now."
        }
        "stopping" {
            $statusBadge.Text = "STOPPING"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
            $toggleButton.Text = "Stopping..."
            $toggleButton.BackColor = [System.Drawing.Color]::FromArgb(74, 62, 18)
            $toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(255, 239, 198)
            $headline.Text = "Stopping worker."
            $subtitle.Text = "The current run is shutting down cleanly."
        }
        "error" {
            $statusBadge.Text = "ERROR"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(95, 32, 36)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 208, 215)
            $toggleButton.Text = "Start worker"
            $toggleButton.BackColor = [System.Drawing.Color]::FromArgb(30, 66, 58)
            $toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(191, 255, 232)
            $headline.Text = "Worker needs attention."
            $subtitle.Text = "Try starting the worker again from this panel."
        }
        default {
            $statusBadge.Text = "IDLE"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(54, 54, 54)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(235, 235, 235)
            $toggleButton.Text = "Start worker"
            $toggleButton.BackColor = [System.Drawing.Color]::FromArgb(30, 66, 58)
            $toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(191, 255, 232)
            $headline.Text = "Worker ready."
            $subtitle.Text = "Start the local worker when you're ready."
        }
    }

    $lastErrorText = if ($worker.lastError) { [string]$worker.lastError } else { "" }
    $hasErrorText = -not [string]::IsNullOrWhiteSpace($lastErrorText)
    $preflightOk = $false
    if ($State.preflight -and $null -ne $State.preflight.ok) {
        $preflightOk = [bool]$State.preflight.ok
    }

    if ($healthBadge) {
        if ($status -eq "running" -and -not $hasErrorText -and $preflightOk) {
            $healthBadge.Text = "HEALTHY"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(18, 84, 56)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(188, 255, 233)
        } elseif ($status -eq "running") {
            $healthBadge.Text = "DEGRADED"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
        } elseif ($status -eq "stopping") {
            $healthBadge.Text = "STOPPING"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
        } elseif ($status -eq "starting") {
            $healthBadge.Text = "CHECKING"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(69, 82, 103)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(225, 232, 243)
        } elseif ($status -eq "error" -or $hasErrorText) {
            $healthBadge.Text = "UNHEALTHY"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(95, 32, 36)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 208, 215)
        } else {
            $healthBadge.Text = "STOPPED"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(54, 54, 54)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(235, 235, 235)
        }
    }

    if ($stopStateLabel) {
        if ($status -eq "stopping") {
            $stopStateLabel.Text = "Stop requested. Waiting for worker exit..."
        } elseif ($status -eq "running") {
            $stopStateLabel.Text = "Worker process is active on this machine."
        } elseif ($status -eq "starting") {
            $stopStateLabel.Text = "Startup in progress. Health is warming up."
        } elseif ($status -eq "error" -and $hasErrorText) {
            $stopStateLabel.Text = "Worker reported: $lastErrorText"
        } else {
            $stopStateLabel.Text = "Worker is fully stopped."
        }
    }

    if ($repoValue) {
        $repoValue.Text = $script:repoRoot
    }

    Update-WorkerNamePresentation -Value $state.config.workerName -PublishedValue $script:publishedWorkerName -RuntimeStatus $status | Out-Null

    if ($summaryDesktopValue) {
        $summaryDesktopValue.Text = "No-console"
    }
    if ($summaryNameValue) {
        $summaryNameValue.Text = $state.worker.workerName
    }
    if ($summaryStateValue) {
        $summaryStateValue.Text = $status.ToUpperInvariant()
    }
    if ($summaryRepoValue) {
        $summaryRepoValue.Text = "Linked"
    }
    if ($systemDesktopValue) {
        $systemDesktopValue.Text = "No console"
    }
    if ($systemSiteValue) {
        $systemSiteValue.Text = "operations.getaxiom.ca"
    }
    if ($systemRepoValue) {
        $systemRepoValue.Text = [System.IO.Path]::GetFileName($script:repoRoot)
    }

    $toggleButton.Enabled = -not $script:actionBusy -and $status -ne "starting" -and $status -ne "stopping"
    $openLiveButton.Enabled = -not $script:actionBusy
    $saveNameButton.Enabled = -not $script:actionBusy
    $changeRepoButton.Enabled = -not $script:actionBusy
    $createLauncherButton.Enabled = -not $script:actionBusy
}

function Refresh-State {
    if ($script:refreshBusy) {
        return
    }

    $script:refreshBusy = $true
    try {
        if (-not (Test-BackendReady)) {
            $statusBadge.Text = "BOOTING"
            $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
            $headline.Text = "Starting backend..."
            $subtitle.Text = "Waiting for the local worker control server."
            if ($healthBadge) {
                $healthBadge.Text = "CHECKING"
                $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(69, 82, 103)
                $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(225, 232, 243)
            }
            if ($stopStateLabel) {
                $stopStateLabel.Text = "Control service is booting."
            }
            if ($summaryStateValue) {
                $summaryStateValue.Text = "BOOTING"
            }
    if ($systemDesktopValue) {
        $systemDesktopValue.Text = "No console"
    }
    if ($systemSiteValue) {
        $systemSiteValue.Text = "operations.getaxiom.ca"
    }
    if ($systemRepoValue) {
        $systemRepoValue.Text = [System.IO.Path]::GetFileName($script:repoRoot)
    }
            Update-WorkerNamePresentation -Value $workerNameInput.Text -PublishedValue $script:publishedWorkerName -RuntimeStatus "booting" | Out-Null
            return
        }

        $state = Invoke-BackendJson -Method GET -Url $stateUrl
        if ($state) {
            $script:currentState = $state
            Update-VisualState -State $state
        }
    } catch {
        $statusBadge.Text = "OFFLINE"
        $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(95, 32, 36)
        $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 208, 215)
        $headline.Text = "Worker backend unavailable."
        $subtitle.Text = "Start the launcher again from the repo folder."
        if ($healthBadge) {
            $healthBadge.Text = "OFFLINE"
            $healthBadge.BackColor = [System.Drawing.Color]::FromArgb(95, 32, 36)
            $healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 208, 215)
        }
        if ($stopStateLabel) {
            $stopStateLabel.Text = "Control API is not reachable from this launcher."
        }
        if ($summaryStateValue) {
            $summaryStateValue.Text = "OFFLINE"
        }
    if ($systemDesktopValue) {
        $systemDesktopValue.Text = "No console"
    }
    if ($systemSiteValue) {
        $systemSiteValue.Text = "operations.getaxiom.ca"
    }
    if ($systemRepoValue) {
        $systemRepoValue.Text = [System.IO.Path]::GetFileName($script:repoRoot)
    }
        Update-WorkerNamePresentation -Value $workerNameInput.Text -PublishedValue $script:publishedWorkerName -RuntimeStatus "offline" | Out-Null
        $toggleButton.Enabled = $false
    } finally {
        $script:refreshBusy = $false
    }
}

function Invoke-WorkerAction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    if ($script:actionBusy) {
        return
    }

    $script:actionBusy = $true
    $toggleButton.Enabled = $false
    $openLiveButton.Enabled = $false
    try {
        [void](Invoke-BackendJson -Method POST -Url $Url)
        Start-Sleep -Milliseconds 250
        Refresh-State
    } catch {
        $statusBadge.Text = "ERROR"
        $statusBadge.BackColor = [System.Drawing.Color]::FromArgb(95, 32, 36)
        $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(255, 208, 215)
        $headline.Text = "Action failed."
        $subtitle.Text = "The worker backend did not accept the request."
    } finally {
        $script:actionBusy = $false
        $toggleButton.Enabled = $true
        $openLiveButton.Enabled = $true
    }
}

function New-LauncherFont {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Families,
        [Parameter(Mandatory = $true)]
        [double]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )

    foreach ($family in $Families) {
        try {
            return New-Object System.Drawing.Font($family, [float]$Size, $Style)
        } catch {
        }
    }

    return New-Object System.Drawing.Font("Segoe UI", [float]$Size, $Style)
}

function Set-SecondaryButtonStyle {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Forms.Button]$Button
    )

    $Button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $Button.FlatAppearance.BorderSize = 1
    $Button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(57, 74, 95)
    $Button.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(20, 30, 42)
    $Button.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(12, 18, 26)
    $Button.BackColor = [System.Drawing.Color]::FromArgb(15, 22, 31)
    $Button.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
    $Button.Font = New-LauncherFont -Families @("Aptos", "Segoe UI Semibold", "Segoe UI") -Size 9
    $Button.Cursor = [System.Windows.Forms.Cursors]::Hand
}

function Update-WorkerNamePresentation {
    param(
        [AllowEmptyString()]
        [string]$Value,
        [AllowEmptyString()]
        [string]$PublishedValue,
        [AllowEmptyString()]
        [string]$RuntimeStatus = ""
    )

    $cleaned = Sanitize-WorkerName -Value $Value
    $publishedCleaned = Sanitize-WorkerName -Value $PublishedValue
    $isDirty = -not [string]::IsNullOrWhiteSpace($publishedCleaned) -and ($cleaned -ne $publishedCleaned)
    $isLive = $RuntimeStatus -in @("running", "starting")

    if ($workerNamePreviewValue) {
        $workerNamePreviewValue.Text = $cleaned
    }
    if ($summaryHeroValue) {
        $summaryHeroValue.Text = $cleaned
    }
    if ($workerIdentityLine) {
        if ($isDirty) {
            $workerIdentityLine.Text = "READY TO PUBLISH: $cleaned"
            $workerIdentityLine.ForeColor = [System.Drawing.Color]::FromArgb(255, 209, 132)
        } elseif ($isLive) {
            $workerIdentityLine.Text = "LIVE ON SITE: $cleaned"
            $workerIdentityLine.ForeColor = [System.Drawing.Color]::FromArgb(111, 230, 184)
        } else {
            $workerIdentityLine.Text = "PUBLISHED ON SITE: $cleaned"
            $workerIdentityLine.ForeColor = [System.Drawing.Color]::FromArgb(111, 230, 184)
        }
    }
    if ($systemNameValue) {
        $systemNameValue.Text = $cleaned
    }
    if ($summaryNameValue) {
        $summaryNameValue.Text = $cleaned
    }
    if ($workerNamePreviewStatus) {
        if ($isDirty) {
            $workerNamePreviewStatus.Text = "UNSAVED"
            $workerNamePreviewStatus.BackColor = [System.Drawing.Color]::FromArgb(96, 74, 15)
            $workerNamePreviewStatus.ForeColor = [System.Drawing.Color]::FromArgb(255, 242, 196)
        } elseif ($isLive) {
            $workerNamePreviewStatus.Text = "LIVE"
            $workerNamePreviewStatus.BackColor = [System.Drawing.Color]::FromArgb(18, 84, 56)
            $workerNamePreviewStatus.ForeColor = [System.Drawing.Color]::FromArgb(188, 255, 233)
        } else {
            $workerNamePreviewStatus.Text = "SYNCED"
            $workerNamePreviewStatus.BackColor = [System.Drawing.Color]::FromArgb(24, 52, 73)
            $workerNamePreviewStatus.ForeColor = [System.Drawing.Color]::FromArgb(193, 231, 255)
        }
    }

    return $cleaned
}

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Axiom Worker Suite"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(1100, 740)
$form.MinimumSize = New-Object System.Drawing.Size(1000, 680)
$form.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI", "Tahoma") -Size 9
$form.BackColor = [System.Drawing.Color]::FromArgb(6, 11, 17)
$form.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.ShowIcon = $true
$form.ShowInTaskbar = $true
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Add_Paint({
    param($sender, $e)

    if ($sender.ClientSize.Width -lt 2 -or $sender.ClientSize.Height -lt 2) {
        return
    }

    $rect = New-Object System.Drawing.Rectangle(0, 0, $sender.ClientSize.Width, $sender.ClientSize.Height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(3, 7, 12),
        [System.Drawing.Color]::FromArgb(14, 22, 34),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    try {
        $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $e.Graphics.FillRectangle($brush, $rect)
        $rail = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 136, 110))
        try {
            $e.Graphics.FillRectangle($rail, 0, 0, 6, $sender.ClientSize.Height)
        } finally {
            $rail.Dispose()
        }

        $glowA = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 53, 242, 182))
        $glowB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 52, 213, 255))
        $glowC = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16, 249, 199, 79))
        try {
            $e.Graphics.FillEllipse($glowA, [Math]::Max(0, $sender.ClientSize.Width - 260), -90, 320, 320)
            $e.Graphics.FillEllipse($glowB, -100, [Math]::Max(0, $sender.ClientSize.Height - 220), 300, 300)
            $e.Graphics.FillEllipse($glowC, [Math]::Max(0, [int]($sender.ClientSize.Width * 0.42)), [Math]::Max(0, $sender.ClientSize.Height - 140), 260, 260)
        } finally {
            $glowA.Dispose()
            $glowB.Dispose()
            $glowC.Dispose()
        }
    } finally {
        $brush.Dispose()
    }
})
$form.Add_Resize({ $form.Invalidate() })
if ($script:launcherIconPath) {
    Set-FormBrandIcon -Form $form -IconPath $script:launcherIconPath
}

$top = New-Object System.Windows.Forms.Panel
$top.Dock = [System.Windows.Forms.DockStyle]::Top
$top.Height = 172
$top.BackColor = [System.Drawing.Color]::FromArgb(10, 16, 24)
$top.Padding = New-Object System.Windows.Forms.Padding(24, 20, 24, 14)
$form.Controls.Add($top)

$topLine = New-Object System.Windows.Forms.Panel
$topLine.Dock = [System.Windows.Forms.DockStyle]::Bottom
$topLine.Height = 1
$topLine.BackColor = [System.Drawing.Color]::FromArgb(39, 57, 77)
$top.Controls.Add($topLine)

$logo = New-Object System.Windows.Forms.PictureBox
$logo.Size = New-Object System.Drawing.Size(178, 50)
$logo.Location = New-Object System.Drawing.Point(20, 26)
$logo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
if (Test-Path -LiteralPath $script:logoPath) {
    $logo.Image = [System.Drawing.Image]::FromFile($script:logoPath)
}
$script:logoControl = $logo
$top.Controls.Add($logo)

$titlePanel = New-Object System.Windows.Forms.Panel
$titlePanel.Location = New-Object System.Drawing.Point(212, 18)
$titlePanel.Size = New-Object System.Drawing.Size(640, 102)
$titlePanel.BackColor = [System.Drawing.Color]::Transparent
$top.Controls.Add($titlePanel)

$headline = New-Object System.Windows.Forms.Label
$headline.AutoSize = $true
$headline.Location = New-Object System.Drawing.Point(0, 0)
$headline.Font = New-LauncherFont -Families @("Segoe UI Variable Display", "Bahnschrift SemiCondensed", "Bahnschrift", "Aptos Display", "Segoe UI Semibold", "Segoe UI") -Size 30 -Style ([System.Drawing.FontStyle]::Bold)
$headline.Text = "Axiom control surface."
$titlePanel.Controls.Add($headline)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(2, 38)
$subtitle.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI") -Size 10.5
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(168, 184, 200)
$subtitle.Text = "Publish the worker name, relink the repo, and launch the live worker from one polished Windows surface."
$titlePanel.Controls.Add($subtitle)

$modeLabel = New-Object System.Windows.Forms.Label
$modeLabel.AutoSize = $true
$modeLabel.Location = New-Object System.Drawing.Point(2, 57)
$modeLabel.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI") -Size 8.75
$modeLabel.ForeColor = [System.Drawing.Color]::FromArgb(124, 138, 150)
$modeLabel.Text = "Windows desktop suite | Cloudflare worker | Live hunt"
$titlePanel.Controls.Add($modeLabel)

$runtimeLabel = New-Object System.Windows.Forms.Label
$runtimeLabel.AutoSize = $true
$runtimeLabel.Location = New-Object System.Drawing.Point(874, 14)
$runtimeLabel.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI") -Size 8.25
$runtimeLabel.ForeColor = [System.Drawing.Color]::FromArgb(134, 153, 171)
$runtimeLabel.Text = "Runtime state"
$top.Controls.Add($runtimeLabel)

$statusBadge = New-Object System.Windows.Forms.Label
$statusBadge.AutoSize = $false
$statusBadge.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$statusBadge.Size = New-Object System.Drawing.Size(138, 38)
$statusBadge.Location = New-Object System.Drawing.Point(874, 34)
$statusBadge.Font = New-Object System.Drawing.Font("Bahnschrift", 9.5, [System.Drawing.FontStyle]::Bold)
$statusBadge.Text = "IDLE"
$statusBadge.BackColor = [System.Drawing.Color]::FromArgb(54, 54, 54)
$statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(235, 235, 235)
$statusBadge.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 4)
$top.Controls.Add($statusBadge)

$body = New-Object System.Windows.Forms.Panel
$body.Dock = [System.Windows.Forms.DockStyle]::Fill
$body.Padding = New-Object System.Windows.Forms.Padding(24, 18, 24, 24)
$form.Controls.Add($body)

function New-LauncherFont {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Families,
        [Parameter(Mandatory = $true)]
        [double]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )

    foreach ($family in $Families) {
        try {
            return New-Object System.Drawing.Font($family, [float]$Size, $Style)
        } catch {
        }
    }

    return New-Object System.Drawing.Font("Segoe UI", [float]$Size, $Style)
}

function Set-SecondaryButtonStyle {
    param(
        [Parameter(Mandatory = $true)]
        [System.Windows.Forms.Button]$Button
    )

    $Button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $Button.FlatAppearance.BorderSize = 1
    $Button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(57, 74, 95)
    $Button.BackColor = [System.Drawing.Color]::FromArgb(15, 22, 31)
    $Button.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
    $Button.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI Semibold", "Segoe UI") -Size 9.25
    $Button.Cursor = [System.Windows.Forms.Cursors]::Hand
}

$storedConfig = Load-StudioConfig
$storedWorkerName = Get-StudioConfigValue -Config $storedConfig -Name "workerName"
$summaryWorkerName = if (-not [string]::IsNullOrWhiteSpace([string]$storedWorkerName)) { [string]$storedWorkerName } else { "local-worker" }

$summaryBand = New-Object System.Windows.Forms.Panel
$summaryBand.Dock = [System.Windows.Forms.DockStyle]::Top
$summaryBand.Height = 210
$summaryBand.BackColor = [System.Drawing.Color]::FromArgb(10, 16, 24)
$summaryBand.Padding = New-Object System.Windows.Forms.Padding(22, 16, 22, 18)
$body.Controls.Add($summaryBand)

$summaryAccent = New-Object System.Windows.Forms.Panel
$summaryAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$summaryAccent.Height = 2
$summaryAccent.BackColor = [System.Drawing.Color]::FromArgb(38, 153, 119)
$summaryBand.Controls.Add($summaryAccent)

$summaryTitle = New-Object System.Windows.Forms.Label
$summaryTitle.AutoSize = $true
$summaryTitle.Location = New-Object System.Drawing.Point(22, 16)
$summaryTitle.Font = New-LauncherFont -Families @("Segoe UI Variable Display", "Bahnschrift SemiCondensed", "Bahnschrift", "Aptos Display", "Segoe UI Semibold", "Segoe UI") -Size 22 -Style ([System.Drawing.FontStyle]::Bold)
$summaryTitle.Text = "AXIOM WORKER SUITE"
$summaryBand.Controls.Add($summaryTitle)

$summarySubtitle = New-Object System.Windows.Forms.Label
$summarySubtitle.AutoSize = $true
$summarySubtitle.Location = New-Object System.Drawing.Point(24, 46)
$summarySubtitle.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI") -Size 9.5
$summarySubtitle.ForeColor = [System.Drawing.Color]::FromArgb(167, 181, 194)
$summarySubtitle.Text = "A native control surface for naming the worker, relinking the repo, and launching the live session."
$summaryBand.Controls.Add($summarySubtitle)

$summaryHero = New-Object System.Windows.Forms.Panel
$summaryHero.Location = New-Object System.Drawing.Point(22, 76)
$summaryHero.Size = New-Object System.Drawing.Size(304, 112)
$summaryHero.BackColor = [System.Drawing.Color]::FromArgb(12, 18, 26)
$summaryHero.Padding = New-Object System.Windows.Forms.Padding(14, 12, 14, 12)
$summaryBand.Controls.Add($summaryHero)

$summaryHeroAccent = New-Object System.Windows.Forms.Panel
$summaryHeroAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$summaryHeroAccent.Height = 4
$summaryHeroAccent.BackColor = [System.Drawing.Color]::FromArgb(34, 213, 255)
$summaryHero.Controls.Add($summaryHeroAccent)

$summaryHeroLabel = New-Object System.Windows.Forms.Label
$summaryHeroLabel.AutoSize = $true
$summaryHeroLabel.Location = New-Object System.Drawing.Point(12, 14)
$summaryHeroLabel.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 8
$summaryHeroLabel.ForeColor = [System.Drawing.Color]::FromArgb(152, 168, 182)
$summaryHeroLabel.Text = "CURRENT PUBLIC NAME"
$summaryHero.Controls.Add($summaryHeroLabel)

$summaryHeroValue = New-Object System.Windows.Forms.Label
$summaryHeroValue.AutoSize = $false
$summaryHeroValue.Location = New-Object System.Drawing.Point(12, 32)
$summaryHeroValue.Size = New-Object System.Drawing.Size(274, 34)
$summaryHeroValue.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 22 -Style ([System.Drawing.FontStyle]::Bold)
$summaryHeroValue.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
$summaryHeroValue.AutoEllipsis = $true
$summaryHeroValue.Text = $summaryWorkerName
$summaryHero.Controls.Add($summaryHeroValue)

$summaryHeroNote = New-Object System.Windows.Forms.Label
$summaryHeroNote.AutoSize = $false
$summaryHeroNote.Location = New-Object System.Drawing.Point(12, 68)
$summaryHeroNote.Size = New-Object System.Drawing.Size(274, 22)
$summaryHeroNote.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Segoe UI") -Size 8.6
$summaryHeroNote.ForeColor = [System.Drawing.Color]::FromArgb(137, 150, 163)
$summaryHeroNote.Text = "This is what the live hunt site and launcher remember."
$summaryHero.Controls.Add($summaryHeroNote)

$summaryTileHost = New-Object System.Windows.Forms.FlowLayoutPanel
$summaryTileHost.AutoSize = $false
$summaryTileHost.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$summaryTileHost.WrapContents = $true
$summaryTileHost.Location = New-Object System.Drawing.Point(346, 18)
$summaryTileHost.Size = New-Object System.Drawing.Size(660, 166)
$summaryTileHost.BackColor = [System.Drawing.Color]::Transparent
$summaryTileHost.Padding = New-Object System.Windows.Forms.Padding(0)
$summaryTileHost.Margin = New-Object System.Windows.Forms.Padding(0)
$summaryBand.Controls.Add($summaryTileHost)

function New-SummaryTile {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][string]$Accent
    )

    $tile = New-Object System.Windows.Forms.Panel
    $tile.Size = New-Object System.Drawing.Size(300, 76)
    $tile.Margin = New-Object System.Windows.Forms.Padding(0, 0, 10, 8)
    $tile.BackColor = [System.Drawing.Color]::FromArgb(14, 20, 28)
    $tile.Padding = New-Object System.Windows.Forms.Padding(14, 10, 14, 10)

    $topLine = New-Object System.Windows.Forms.Panel
    $topLine.Dock = [System.Windows.Forms.DockStyle]::Top
    $topLine.Height = 5
    $topLine.BackColor = [System.Drawing.ColorTranslator]::FromHtml($Accent)
    $tile.Controls.Add($topLine)

    $label = New-Object System.Windows.Forms.Label
    $label.AutoSize = $true
    $label.Location = New-Object System.Drawing.Point(14, 14)
    $label.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 7.5
    $label.ForeColor = [System.Drawing.Color]::FromArgb(152, 168, 182)
    $label.Text = $Title.ToUpperInvariant()
    $tile.Controls.Add($label)

    $valueLabel = New-Object System.Windows.Forms.Label
    $valueLabel.AutoSize = $false
    $valueLabel.Location = New-Object System.Drawing.Point(14, 34)
    $valueLabel.Size = New-Object System.Drawing.Size(292, 28)
    $valueLabel.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 15.5 -Style ([System.Drawing.FontStyle]::Bold)
    $valueLabel.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
    $valueLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $valueLabel.Text = $Value
    $tile.Controls.Add($valueLabel)

    return [pscustomobject]@{
        Panel = $tile
        ValueLabel = $valueLabel
    }
}

function New-ReadoutTile {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Value,
        [Parameter(Mandatory = $true)][string]$Accent,
        [Parameter(Mandatory = $true)][string]$Note
    )

    $tile = New-Object System.Windows.Forms.Panel
    $tile.Size = New-Object System.Drawing.Size(162, 72)
    $tile.BackColor = [System.Drawing.Color]::FromArgb(12, 18, 26)
    $tile.Padding = New-Object System.Windows.Forms.Padding(14, 10, 14, 10)

    $topLine = New-Object System.Windows.Forms.Panel
    $topLine.Dock = [System.Windows.Forms.DockStyle]::Top
    $topLine.Height = 4
    $topLine.BackColor = [System.Drawing.ColorTranslator]::FromHtml($Accent)
    $tile.Controls.Add($topLine)

    $label = New-Object System.Windows.Forms.Label
    $label.AutoSize = $true
    $label.Location = New-Object System.Drawing.Point(12, 14)
    $label.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 7.75
    $label.ForeColor = [System.Drawing.Color]::FromArgb(152, 168, 182)
    $label.Text = $Title.ToUpperInvariant()
    $tile.Controls.Add($label)

    $valueLabel = New-Object System.Windows.Forms.Label
    $valueLabel.AutoSize = $false
    $valueLabel.Location = New-Object System.Drawing.Point(12, 29)
    $valueLabel.Size = New-Object System.Drawing.Size(134, 18)
    $valueLabel.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 11.5 -Style ([System.Drawing.FontStyle]::Bold)
    $valueLabel.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
    $valueLabel.AutoEllipsis = $true
    $valueLabel.Text = $Value
    $tile.Controls.Add($valueLabel)

    $noteLabel = New-Object System.Windows.Forms.Label
    $noteLabel.AutoSize = $false
    $noteLabel.Location = New-Object System.Drawing.Point(12, 47)
    $noteLabel.Size = New-Object System.Drawing.Size(134, 14)
    $noteLabel.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Segoe UI") -Size 8
    $noteLabel.ForeColor = [System.Drawing.Color]::FromArgb(137, 150, 163)
    $noteLabel.Text = $Note
    $tile.Controls.Add($noteLabel)

    return [pscustomobject]@{
        Panel = $tile
        ValueLabel = $valueLabel
    }
}

$summaryDesktopTile = New-SummaryTile -Title "Desktop" -Value "No-console" -Accent "#35f2b6"
$summaryNameTile = New-SummaryTile -Title "Worker name" -Value $summaryWorkerName -Accent "#34d5ff"
$summaryStateTile = New-SummaryTile -Title "State" -Value "IDLE" -Accent "#f9c74f"
$summaryRepoTile = New-SummaryTile -Title "Repo" -Value "Linked" -Accent "#7cf29c"

$summaryTileHost.Controls.Add($summaryDesktopTile.Panel)
$summaryTileHost.Controls.Add($summaryNameTile.Panel)
$summaryTileHost.Controls.Add($summaryStateTile.Panel)
$summaryTileHost.Controls.Add($summaryRepoTile.Panel)

$summaryDesktopValue = $summaryDesktopTile.ValueLabel
$summaryNameValue = $summaryNameTile.ValueLabel
$summaryStateValue = $summaryStateTile.ValueLabel
$summaryRepoValue = $summaryRepoTile.ValueLabel

$workspace = New-Object System.Windows.Forms.TableLayoutPanel
$workspace.Dock = [System.Windows.Forms.DockStyle]::Fill
$workspace.ColumnCount = 2
$workspace.RowCount = 2
$workspace.Padding = New-Object System.Windows.Forms.Padding(0, 14, 0, 0)
$workspace.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 56)))
$workspace.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 44)))
$workspace.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 66)))
$workspace.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 34)))
$body.Controls.Add($workspace)

$identityCard = New-Object System.Windows.Forms.Panel
$identityCard.Dock = [System.Windows.Forms.DockStyle]::Fill
$identityCard.BackColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
$identityCard.Padding = New-Object System.Windows.Forms.Padding(28, 22, 28, 22)
$identityCard.Margin = New-Object System.Windows.Forms.Padding(0, 0, 10, 0)
$workspace.Controls.Add($identityCard, 0, 0)

$identityAccent = New-Object System.Windows.Forms.Panel
$identityAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$identityAccent.Height = 3
$identityAccent.BackColor = [System.Drawing.Color]::FromArgb(38, 153, 119)
$identityCard.Controls.Add($identityAccent)

$identityTitle = New-Object System.Windows.Forms.Label
$identityTitle.AutoSize = $true
$identityTitle.Location = New-Object System.Drawing.Point(24, 16)
$identityTitle.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 14.5 -Style ([System.Drawing.FontStyle]::Bold)
$identityTitle.Text = "PUBLIC WORKER NAME"
$identityCard.Controls.Add($identityTitle)

$identityHint = New-Object System.Windows.Forms.Label
$identityHint.AutoSize = $false
$identityHint.Location = New-Object System.Drawing.Point(24, 42)
$identityHint.Size = New-Object System.Drawing.Size(476, 20)
$identityHint.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI") -Size 8.8
$identityHint.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$identityHint.Text = "This is the name that appears on the live hunt site and in the launcher."
$identityCard.Controls.Add($identityHint)

$workerNameInput = New-Object System.Windows.Forms.TextBox
$workerNameInput.Location = New-Object System.Drawing.Point(24, 66)
$workerNameInput.Size = New-Object System.Drawing.Size(348, 36)
$workerNameInput.BackColor = [System.Drawing.Color]::FromArgb(16, 22, 31)
$workerNameInput.ForeColor = [System.Drawing.Color]::FromArgb(244, 247, 250)
$workerNameInput.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$workerNameInput.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 10.5
$workerNameInput.Text = "local-worker"
$storedConfig = Load-StudioConfig
$storedWorkerName = Get-StudioConfigValue -Config $storedConfig -Name "workerName"
if (-not [string]::IsNullOrWhiteSpace([string]$storedWorkerName)) {
    $workerNameInput.Text = [string]$storedWorkerName
}
$script:publishedWorkerName = $workerNameInput.Text
$identityCard.Controls.Add($workerNameInput)
$workerNameInput.Add_KeyDown({
    if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
        $_.SuppressKeyPress = $true
        $saveNameButton.PerformClick()
    }
})
$workerNameInput.Add_TextChanged({
    $runtimeStatus = ""
    if ($script:currentState -and $script:currentState.worker -and $script:currentState.worker.status) {
        $runtimeStatus = [string]$script:currentState.worker.status
    }
    Update-WorkerNamePresentation -Value $workerNameInput.Text -PublishedValue $script:publishedWorkerName -RuntimeStatus $runtimeStatus | Out-Null
})

$saveNameButton = New-Object System.Windows.Forms.Button
$saveNameButton.Size = New-Object System.Drawing.Size(128, 36)
$saveNameButton.Location = New-Object System.Drawing.Point(382, 65)
$saveNameButton.Text = "PUBLISH NAME"
$saveNameButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$saveNameButton.TabStop = $false
$saveNameButton.UseCompatibleTextRendering = $true
$saveNameButton.UseVisualStyleBackColor = $false
$saveNameButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$saveNameButton.FlatAppearance.BorderSize = 1
$saveNameButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$identityCard.Controls.Add($saveNameButton)
Set-SecondaryButtonStyle -Button $saveNameButton

$workerNamePreview = New-Object System.Windows.Forms.Panel
$workerNamePreview.Location = New-Object System.Drawing.Point(24, 114)
$workerNamePreview.Size = New-Object System.Drawing.Size(490, 104)
$workerNamePreview.BackColor = [System.Drawing.Color]::FromArgb(10, 18, 27)
$workerNamePreview.Padding = New-Object System.Windows.Forms.Padding(14, 12, 14, 12)
$identityCard.Controls.Add($workerNamePreview)

$workerNamePreviewLabel = New-Object System.Windows.Forms.Label
$workerNamePreviewLabel.AutoSize = $true
$workerNamePreviewLabel.Location = New-Object System.Drawing.Point(12, 8)
$workerNamePreviewLabel.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 8
$workerNamePreviewLabel.ForeColor = [System.Drawing.Color]::FromArgb(152, 168, 182)
$workerNamePreviewLabel.Text = "CURRENT PUBLIC NAME"
$workerNamePreview.Controls.Add($workerNamePreviewLabel)

$workerNamePreviewStatus = New-Object System.Windows.Forms.Label
$workerNamePreviewStatus.AutoSize = $false
$workerNamePreviewStatus.Location = New-Object System.Drawing.Point(404, 8)
$workerNamePreviewStatus.Size = New-Object System.Drawing.Size(62, 20)
$workerNamePreviewStatus.Font = New-Object System.Drawing.Font("Bahnschrift", 7.75, [System.Drawing.FontStyle]::Bold)
$workerNamePreviewStatus.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$workerNamePreviewStatus.Text = "SYNCED"
$workerNamePreviewStatus.BackColor = [System.Drawing.Color]::FromArgb(24, 52, 73)
$workerNamePreviewStatus.ForeColor = [System.Drawing.Color]::FromArgb(193, 231, 255)
$workerNamePreview.Controls.Add($workerNamePreviewStatus)

$workerNamePreviewValue = New-Object System.Windows.Forms.Label
$workerNamePreviewValue.AutoSize = $false
$workerNamePreviewValue.Location = New-Object System.Drawing.Point(12, 28)
$workerNamePreviewValue.Size = New-Object System.Drawing.Size(452, 34)
$workerNamePreviewValue.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 19 -Style ([System.Drawing.FontStyle]::Bold)
$workerNamePreviewValue.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
$workerNamePreviewValue.AutoEllipsis = $true
$workerNamePreviewValue.Text = $workerNameInput.Text
$workerNamePreview.Controls.Add($workerNamePreviewValue)

$workerNamePreviewNote = New-Object System.Windows.Forms.Label
$workerNamePreviewNote.AutoSize = $false
$workerNamePreviewNote.Location = New-Object System.Drawing.Point(12, 64)
$workerNamePreviewNote.Size = New-Object System.Drawing.Size(452, 20)
$workerNamePreviewNote.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Aptos", "Segoe UI") -Size 8.5
$workerNamePreviewNote.ForeColor = [System.Drawing.Color]::FromArgb(137, 150, 163)
$workerNamePreviewNote.Text = "Press Enter or Publish name to update .env.worker and restart the live worker."
$workerNamePreview.Controls.Add($workerNamePreviewNote)

$controlCard = New-Object System.Windows.Forms.Panel
$controlCard.Dock = [System.Windows.Forms.DockStyle]::Fill
$controlCard.BackColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
$controlCard.Padding = New-Object System.Windows.Forms.Padding(22, 16, 22, 16)
$controlCard.Margin = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)
$workspace.Controls.Add($controlCard, 1, 0)

$controlAccent = New-Object System.Windows.Forms.Panel
$controlAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$controlAccent.Height = 3
$controlAccent.BackColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$controlCard.Controls.Add($controlAccent)

$controlTitle = New-Object System.Windows.Forms.Label
$controlTitle.AutoSize = $true
$controlTitle.Location = New-Object System.Drawing.Point(24, 12)
$controlTitle.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 14.5 -Style ([System.Drawing.FontStyle]::Bold)
$controlTitle.Text = "LAUNCH CONTROL"
$controlCard.Controls.Add($controlTitle)

$controlCopy = New-Object System.Windows.Forms.Label
$controlCopy.AutoSize = $false
$controlCopy.Location = New-Object System.Drawing.Point(24, 34)
$controlCopy.Size = New-Object System.Drawing.Size(364, 34)
$controlCopy.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$controlCopy.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Segoe UI") -Size 9
$controlCopy.Text = "Start and stop the live worker from this machine with no visible console window."
$controlCard.Controls.Add($controlCopy)

$workerIdentityLine = New-Object System.Windows.Forms.Label
$workerIdentityLine.AutoSize = $false
$workerIdentityLine.Location = New-Object System.Drawing.Point(24, 72)
$workerIdentityLine.Size = New-Object System.Drawing.Size(364, 24)
$workerIdentityLine.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 9 -Style ([System.Drawing.FontStyle]::Bold)
$workerIdentityLine.ForeColor = [System.Drawing.Color]::FromArgb(93, 202, 163)
$workerIdentityLine.Text = "PUBLISHED ON SITE: $($workerNameInput.Text)"
$controlCard.Controls.Add($workerIdentityLine)

$toggleButton = New-Object System.Windows.Forms.Button
$toggleButton.Size = New-Object System.Drawing.Size(364, 60)
$toggleButton.Location = New-Object System.Drawing.Point(24, 98)
$toggleButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$toggleButton.FlatAppearance.BorderSize = 0
$toggleButton.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(38, 88, 78)
$toggleButton.FlatAppearance.MouseDownBackColor = [System.Drawing.Color]::FromArgb(22, 55, 48)
$toggleButton.Font = New-Object System.Drawing.Font("Bahnschrift", 12.5, [System.Drawing.FontStyle]::Bold)
$toggleButton.Text = "START WORKER"
$toggleButton.BackColor = [System.Drawing.Color]::FromArgb(26, 74, 63)
$toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(191, 255, 232)
$controlCard.Controls.Add($toggleButton)

$openLiveButton = New-Object System.Windows.Forms.Button
$openLiveButton.Size = New-Object System.Drawing.Size(364, 32)
$openLiveButton.Location = New-Object System.Drawing.Point(24, 166)
$openLiveButton.Text = "OPEN LIVE HUNT"
$openLiveButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$openLiveButton.TabStop = $false
$openLiveButton.UseCompatibleTextRendering = $true
$openLiveButton.UseVisualStyleBackColor = $false
$openLiveButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$openLiveButton.FlatAppearance.BorderSize = 1
$openLiveButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$controlCard.Controls.Add($openLiveButton)
Set-SecondaryButtonStyle -Button $openLiveButton

$healthBadge = New-Object System.Windows.Forms.Label
$healthBadge.AutoSize = $false
$healthBadge.Location = New-Object System.Drawing.Point(304, 14)
$healthBadge.Size = New-Object System.Drawing.Size(144, 30)
$healthBadge.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$healthBadge.Font = New-Object System.Drawing.Font("Bahnschrift", 8.75, [System.Drawing.FontStyle]::Bold)
$healthBadge.Text = "CHECKING"
$healthBadge.BackColor = [System.Drawing.Color]::FromArgb(69, 82, 103)
$healthBadge.ForeColor = [System.Drawing.Color]::FromArgb(225, 232, 243)
$controlCard.Controls.Add($healthBadge)

$stopStateLabel = New-Object System.Windows.Forms.Label
$stopStateLabel.AutoSize = $false
$stopStateLabel.Location = New-Object System.Drawing.Point(24, 204)
$stopStateLabel.Size = New-Object System.Drawing.Size(364, 22)
$stopStateLabel.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Segoe UI") -Size 8.8
$stopStateLabel.ForeColor = [System.Drawing.Color]::FromArgb(124, 138, 150)
$stopStateLabel.Text = "Control service is booting."
$controlCard.Controls.Add($stopStateLabel)

$systemCard = New-Object System.Windows.Forms.Panel
$systemCard.Dock = [System.Windows.Forms.DockStyle]::Fill
$systemCard.BackColor = [System.Drawing.Color]::FromArgb(10, 16, 24)
$systemCard.Padding = New-Object System.Windows.Forms.Padding(28, 16, 28, 18)
$systemCard.Margin = New-Object System.Windows.Forms.Padding(0, 10, 0, 0)
$workspace.Controls.Add($systemCard, 0, 1)
$workspace.SetColumnSpan($systemCard, 2)

$systemAccent = New-Object System.Windows.Forms.Panel
$systemAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$systemAccent.Height = 3
$systemAccent.BackColor = [System.Drawing.Color]::FromArgb(38, 153, 119)
$systemCard.Controls.Add($systemAccent)

$systemTitle = New-Object System.Windows.Forms.Label
$systemTitle.AutoSize = $true
$systemTitle.Location = New-Object System.Drawing.Point(24, 14)
$systemTitle.Font = New-LauncherFont -Families @("Bahnschrift SemiCondensed", "Bahnschrift", "Segoe UI Semibold", "Segoe UI") -Size 14.5 -Style ([System.Drawing.FontStyle]::Bold)
$systemTitle.Text = "WORKSPACE STATUS"
$systemCard.Controls.Add($systemTitle)

$repoTitle = New-Object System.Windows.Forms.Label
$repoTitle.AutoSize = $true
$repoTitle.Location = New-Object System.Drawing.Point(24, 40)
$repoTitle.Font = New-LauncherFont -Families @("Bahnschrift", "Segoe UI Variable Text", "Segoe UI") -Size 8.75 -Style ([System.Drawing.FontStyle]::Bold)
$repoTitle.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$repoTitle.Text = "Repository"
$systemCard.Controls.Add($repoTitle)

$repoValue = New-Object System.Windows.Forms.Label
$repoValue.AutoSize = $false
$repoValue.Location = New-Object System.Drawing.Point(24, 60)
$repoValue.Size = New-Object System.Drawing.Size(320, 26)
$repoValue.Font = New-LauncherFont -Families @("Segoe UI Variable Text", "Bahnschrift", "Segoe UI") -Size 9.2
$repoValue.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$repoValue.Text = $script:repoRoot
$repoValue.AutoEllipsis = $true
$systemCard.Controls.Add($repoValue)

$changeRepoButton = New-Object System.Windows.Forms.Button
$changeRepoButton.Size = New-Object System.Drawing.Size(160, 30)
$changeRepoButton.Location = New-Object System.Drawing.Point(24, 90)
$changeRepoButton.Text = "RELINK REPO"
$changeRepoButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$changeRepoButton.TabStop = $false
$changeRepoButton.UseCompatibleTextRendering = $true
$changeRepoButton.UseVisualStyleBackColor = $false
$changeRepoButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$changeRepoButton.FlatAppearance.BorderSize = 1
$changeRepoButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$systemCard.Controls.Add($changeRepoButton)
Set-SecondaryButtonStyle -Button $changeRepoButton

$createLauncherButton = New-Object System.Windows.Forms.Button
$createLauncherButton.Size = New-Object System.Drawing.Size(160, 30)
$createLauncherButton.Location = New-Object System.Drawing.Point(190, 90)
$createLauncherButton.Text = "CREATE SHORTCUT"
$createLauncherButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$createLauncherButton.TabStop = $false
$createLauncherButton.UseCompatibleTextRendering = $true
$createLauncherButton.UseVisualStyleBackColor = $false
$createLauncherButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$createLauncherButton.FlatAppearance.BorderSize = 1
$createLauncherButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$systemCard.Controls.Add($createLauncherButton)
Set-SecondaryButtonStyle -Button $createLauncherButton

$systemStatsHost = New-Object System.Windows.Forms.FlowLayoutPanel
$systemStatsHost.AutoSize = $false
$systemStatsHost.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$systemStatsHost.WrapContents = $false
$systemStatsHost.Location = New-Object System.Drawing.Point(370, 16)
$systemStatsHost.Size = New-Object System.Drawing.Size(670, 72)
$systemStatsHost.BackColor = [System.Drawing.Color]::Transparent
$systemStatsHost.Padding = New-Object System.Windows.Forms.Padding(0)
$systemStatsHost.Margin = New-Object System.Windows.Forms.Padding(0)
$systemCard.Controls.Add($systemStatsHost)

$systemNameCard = New-ReadoutTile -Title "Public name" -Value $summaryWorkerName -Accent "#34d5ff" -Note "What the live hunt displays."
$systemDesktopCard = New-ReadoutTile -Title "Desktop mode" -Value "No console" -Accent "#35f2b6" -Note "The shortcut stays hidden."
$systemSiteCard = New-ReadoutTile -Title "Live site" -Value "operations.getaxiom.ca" -Accent "#f9c74f" -Note "The worker reports here."
$systemRepoCard = New-ReadoutTile -Title "Linked repo" -Value ([System.IO.Path]::GetFileName($script:repoRoot)) -Accent "#7cf29c" -Note "Relink if the folder moves."

$systemStatsHost.Controls.Add($systemNameCard.Panel)
$systemStatsHost.Controls.Add($systemDesktopCard.Panel)
$systemStatsHost.Controls.Add($systemSiteCard.Panel)
$systemStatsHost.Controls.Add($systemRepoCard.Panel)

$systemNameValue = $systemNameCard.ValueLabel
$systemDesktopValue = $systemDesktopCard.ValueLabel
$systemSiteValue = $systemSiteCard.ValueLabel
$systemRepoValue = $systemRepoCard.ValueLabel

$toggleButton.Add_Click({
    if ($script:actionBusy) {
        return
    }

    if ($script:currentState -and $script:currentState.worker -and ($script:currentState.worker.status -in @("running", "starting"))) {
        Invoke-WorkerAction -Url $stopUrl
    } else {
        Invoke-WorkerAction -Url $startUrl
    }
})

$saveNameButton.Add_Click({
    if ($script:actionBusy) {
        return
    }

    try {
        $cleaned = Set-WorkerNamePersisted -Value $workerNameInput.Text
        $script:publishedWorkerName = $cleaned
        $workerNameInput.Text = $cleaned
        $runtimeStatus = ""
        if ($script:currentState -and $script:currentState.worker -and $script:currentState.worker.status) {
            $runtimeStatus = [string]$script:currentState.worker.status
        }
        Update-WorkerNamePresentation -Value $cleaned -PublishedValue $cleaned -RuntimeStatus $runtimeStatus | Out-Null

        $isRunning = $script:currentState -and $script:currentState.worker -and ($script:currentState.worker.status -in @("running", "starting"))
        if ($isRunning) {
            $workerIdentityLine.Text = "PUBLISHING NAME TO THE LIVE WORKER..."
            [void](Invoke-BackendJson -Method POST -Url $stopUrl)
            Start-Sleep -Milliseconds 500
            [void](Invoke-BackendJson -Method POST -Url $startUrl)
        }

        Refresh-State
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
})

$changeRepoButton.Add_Click({
    if ($script:actionBusy) {
        return
    }

    try {
        $selected = Select-RepoRoot
        if (-not $selected) {
            return
        }

        if ($selected -ne $script:repoRoot) {
            if (Test-BackendReady) {
                try { [void](Invoke-BackendJson -Method POST -Url $shutdownUrl) } catch {}
            }
            Set-RepoRoot -Path $selected
            Start-BackendIfNeeded
            Refresh-State
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
})

$createLauncherButton.Add_Click({
    try {
        $target = Create-DesktopLauncher
        [System.Windows.Forms.MessageBox]::Show("Created desktop launcher:`n$target", "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
})

$openLiveButton.Add_Click({
    Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "start", "", $liveUrl) | Out-Null
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({ Refresh-State })

$form.Add_Shown({
    try {
        [void](Create-DesktopLauncher)
        Start-BackendIfNeeded
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }

    Refresh-State
    $timer.Start()
})

$form.Add_FormClosed({
    $timer.Stop()
    if ($logo -and $logo.Image) {
        $logo.Image.Dispose()
    }
    if ($script:windowIcon) {
        $script:windowIcon.Dispose()
    }
})

[System.Windows.Forms.Application]::Run($form)

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
    Start-Process -FilePath $wscriptPath -ArgumentList @("//B", "//NoLogo", $vbsPath) -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
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

    if ($repoValue) {
        $repoValue.Text = $script:repoRoot
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

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Axiom Worker"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(1040, 700)
$form.MinimumSize = New-Object System.Drawing.Size(980, 640)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.BackColor = [System.Drawing.Color]::FromArgb(7, 10, 14)
$form.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.ShowIcon = $true
$form.ShowInTaskbar = $true
$form.Add_Paint({
    param($sender, $e)

    $rect = New-Object System.Drawing.Rectangle(0, 0, $sender.ClientSize.Width, $sender.ClientSize.Height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(5, 8, 11),
        [System.Drawing.Color]::FromArgb(13, 18, 26),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    try {
        $e.Graphics.FillRectangle($brush, $rect)
        $rail = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, 123, 96))
        try {
            $e.Graphics.FillRectangle($rail, 0, 0, 4, $sender.ClientSize.Height)
        } finally {
            $rail.Dispose()
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
$top.Height = 120
$top.BackColor = [System.Drawing.Color]::FromArgb(11, 15, 20)
$top.Padding = New-Object System.Windows.Forms.Padding(24, 20, 24, 16)
$form.Controls.Add($top)

$topLine = New-Object System.Windows.Forms.Panel
$topLine.Dock = [System.Windows.Forms.DockStyle]::Bottom
$topLine.Height = 1
$topLine.BackColor = [System.Drawing.Color]::FromArgb(26, 37, 46)
$top.Controls.Add($topLine)

$logo = New-Object System.Windows.Forms.PictureBox
$logo.Size = New-Object System.Drawing.Size(160, 46)
$logo.Location = New-Object System.Drawing.Point(20, 24)
$logo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
if (Test-Path -LiteralPath $script:logoPath) {
    $logo.Image = [System.Drawing.Image]::FromFile($script:logoPath)
}
$script:logoControl = $logo
$top.Controls.Add($logo)

$titlePanel = New-Object System.Windows.Forms.Panel
$titlePanel.Location = New-Object System.Drawing.Point(198, 18)
$titlePanel.Size = New-Object System.Drawing.Size(560, 78)
$titlePanel.BackColor = [System.Drawing.Color]::Transparent
$top.Controls.Add($titlePanel)

$headline = New-Object System.Windows.Forms.Label
$headline.AutoSize = $true
$headline.Location = New-Object System.Drawing.Point(0, 0)
$headline.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 21, [System.Drawing.FontStyle]::Bold)
$headline.Text = "Worker ready."
$titlePanel.Controls.Add($headline)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(2, 34)
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$subtitle.Text = "Control the local worker from a clean desktop panel."
$titlePanel.Controls.Add($subtitle)

$modeLabel = New-Object System.Windows.Forms.Label
$modeLabel.AutoSize = $true
$modeLabel.Location = New-Object System.Drawing.Point(2, 57)
$modeLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$modeLabel.ForeColor = [System.Drawing.Color]::FromArgb(124, 138, 150)
$modeLabel.Text = "Cloudflare worker  ·  Desktop launcher  ·  Local machine"
$titlePanel.Controls.Add($modeLabel)

$statusBadge = New-Object System.Windows.Forms.Label
$statusBadge.AutoSize = $false
$statusBadge.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$statusBadge.Size = New-Object System.Drawing.Size(118, 34)
$statusBadge.Location = New-Object System.Drawing.Point(892, 34)
$statusBadge.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$statusBadge.Text = "IDLE"
$statusBadge.BackColor = [System.Drawing.Color]::FromArgb(54, 54, 54)
$statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(235, 235, 235)
$statusBadge.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 4)
$top.Controls.Add($statusBadge)

$body = New-Object System.Windows.Forms.Panel
$body.Dock = [System.Windows.Forms.DockStyle]::Fill
$body.Padding = New-Object System.Windows.Forms.Padding(24, 20, 24, 24)
$form.Controls.Add($body)

$workspace = New-Object System.Windows.Forms.TableLayoutPanel
$workspace.Dock = [System.Windows.Forms.DockStyle]::Fill
$workspace.ColumnCount = 2
$workspace.RowCount = 1
$workspace.Padding = New-Object System.Windows.Forms.Padding(0, 18, 0, 0)
$workspace.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 56)))
$workspace.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 44)))
$workspace.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 100)))
$body.Controls.Add($workspace)

$identityCard = New-Object System.Windows.Forms.Panel
$identityCard.Dock = [System.Windows.Forms.DockStyle]::Fill
$identityCard.BackColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
$identityCard.Padding = New-Object System.Windows.Forms.Padding(24, 20, 24, 20)
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
$identityTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11, [System.Drawing.FontStyle]::Bold)
$identityTitle.Text = "Worker identity"
$identityCard.Controls.Add($identityTitle)

$workerNameInput = New-Object System.Windows.Forms.TextBox
$workerNameInput.Location = New-Object System.Drawing.Point(24, 48)
$workerNameInput.Size = New-Object System.Drawing.Size(302, 30)
$workerNameInput.BackColor = [System.Drawing.Color]::FromArgb(18, 24, 31)
$workerNameInput.ForeColor = [System.Drawing.Color]::FromArgb(240, 244, 248)
$workerNameInput.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
$workerNameInput.Text = "local-worker"
$storedConfig = Load-StudioConfig
$storedWorkerName = Get-StudioConfigValue -Config $storedConfig -Name "workerName"
if (-not [string]::IsNullOrWhiteSpace([string]$storedWorkerName)) {
    $workerNameInput.Text = [string]$storedWorkerName
}
$identityCard.Controls.Add($workerNameInput)

$saveNameButton = New-Object System.Windows.Forms.Button
$saveNameButton.Size = New-Object System.Drawing.Size(120, 32)
$saveNameButton.Location = New-Object System.Drawing.Point(338, 47)
$saveNameButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$saveNameButton.FlatAppearance.BorderSize = 1
$saveNameButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$saveNameButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$saveNameButton.Text = "Save name"
$saveNameButton.BackColor = [System.Drawing.Color]::FromArgb(15, 21, 27)
$saveNameButton.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$identityCard.Controls.Add($saveNameButton)

$repoTitle = New-Object System.Windows.Forms.Label
$repoTitle.AutoSize = $true
$repoTitle.Location = New-Object System.Drawing.Point(24, 98)
$repoTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$repoTitle.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$repoTitle.Text = "Repository"
$identityCard.Controls.Add($repoTitle)

$repoValue = New-Object System.Windows.Forms.Label
$repoValue.AutoSize = $false
$repoValue.Location = New-Object System.Drawing.Point(24, 120)
$repoValue.Size = New-Object System.Drawing.Size(490, 40)
$repoValue.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$repoValue.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$repoValue.Text = $script:repoRoot
$repoValue.AutoEllipsis = $true
$identityCard.Controls.Add($repoValue)

$changeRepoButton = New-Object System.Windows.Forms.Button
$changeRepoButton.Size = New-Object System.Drawing.Size(162, 34)
$changeRepoButton.Location = New-Object System.Drawing.Point(24, 174)
$changeRepoButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$changeRepoButton.FlatAppearance.BorderSize = 1
$changeRepoButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$changeRepoButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$changeRepoButton.Text = "Change repo"
$changeRepoButton.BackColor = [System.Drawing.Color]::FromArgb(15, 21, 27)
$changeRepoButton.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$identityCard.Controls.Add($changeRepoButton)

$createLauncherButton = New-Object System.Windows.Forms.Button
$createLauncherButton.Size = New-Object System.Drawing.Size(170, 34)
$createLauncherButton.Location = New-Object System.Drawing.Point(194, 174)
$createLauncherButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$createLauncherButton.FlatAppearance.BorderSize = 1
$createLauncherButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$createLauncherButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 9)
$createLauncherButton.Text = "Create launcher"
$createLauncherButton.BackColor = [System.Drawing.Color]::FromArgb(15, 21, 27)
$createLauncherButton.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$identityCard.Controls.Add($createLauncherButton)

$controlCard = New-Object System.Windows.Forms.Panel
$controlCard.Dock = [System.Windows.Forms.DockStyle]::Fill
$controlCard.BackColor = [System.Drawing.Color]::FromArgb(12, 16, 22)
$controlCard.Padding = New-Object System.Windows.Forms.Padding(24, 20, 24, 20)
$controlCard.Margin = New-Object System.Windows.Forms.Padding(10, 0, 0, 0)
$workspace.Controls.Add($controlCard, 1, 0)

$controlAccent = New-Object System.Windows.Forms.Panel
$controlAccent.Dock = [System.Windows.Forms.DockStyle]::Top
$controlAccent.Height = 3
$controlAccent.BackColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$controlCard.Controls.Add($controlAccent)

$controlTitle = New-Object System.Windows.Forms.Label
$controlTitle.AutoSize = $true
$controlTitle.Location = New-Object System.Drawing.Point(24, 16)
$controlTitle.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11, [System.Drawing.FontStyle]::Bold)
$controlTitle.Text = "Worker control"
$controlCard.Controls.Add($controlTitle)

$controlCopy = New-Object System.Windows.Forms.Label
$controlCopy.AutoSize = $false
$controlCopy.Location = New-Object System.Drawing.Point(24, 42)
$controlCopy.Size = New-Object System.Drawing.Size(330, 40)
$controlCopy.ForeColor = [System.Drawing.Color]::FromArgb(150, 162, 173)
$controlCopy.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$controlCopy.Text = "Start or stop the worker from this machine."
$controlCard.Controls.Add($controlCopy)

$toggleButton = New-Object System.Windows.Forms.Button
$toggleButton.Size = New-Object System.Drawing.Size(286, 62)
$toggleButton.Location = New-Object System.Drawing.Point(24, 94)
$toggleButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$toggleButton.FlatAppearance.BorderSize = 0
$toggleButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11, [System.Drawing.FontStyle]::Bold)
$toggleButton.Text = "Start worker"
$toggleButton.BackColor = [System.Drawing.Color]::FromArgb(30, 66, 58)
$toggleButton.ForeColor = [System.Drawing.Color]::FromArgb(191, 255, 232)
$controlCard.Controls.Add($toggleButton)

$openLiveButton = New-Object System.Windows.Forms.Button
$openLiveButton.Size = New-Object System.Drawing.Size(286, 36)
$openLiveButton.Location = New-Object System.Drawing.Point(24, 164)
$openLiveButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$openLiveButton.FlatAppearance.BorderSize = 1
$openLiveButton.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(49, 61, 74)
$openLiveButton.BackColor = [System.Drawing.Color]::FromArgb(15, 21, 27)
$openLiveButton.ForeColor = [System.Drawing.Color]::FromArgb(220, 229, 237)
$openLiveButton.Text = "Open live hunt"
$controlCard.Controls.Add($openLiveButton)

$controlHint = New-Object System.Windows.Forms.Label
$controlHint.AutoSize = $false
$controlHint.Location = New-Object System.Drawing.Point(24, 214)
$controlHint.Size = New-Object System.Drawing.Size(300, 34)
$controlHint.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$controlHint.ForeColor = [System.Drawing.Color]::FromArgb(124, 138, 150)
$controlHint.Text = "The live hunt stays online while this panel is open."
$controlCard.Controls.Add($controlHint)

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
        $workerNameInput.Text = $cleaned

        $isRunning = $script:currentState -and $script:currentState.worker -and ($script:currentState.worker.status -in @("running", "starting"))
        if ($isRunning) {
            $result = [System.Windows.Forms.MessageBox]::Show("Worker name saved. Restart the worker to apply it now?", "Axiom Worker", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question)
            if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
                [void](Invoke-BackendJson -Method POST -Url $stopUrl)
                Start-Sleep -Milliseconds 400
                [void](Invoke-BackendJson -Method POST -Url $startUrl)
            }
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

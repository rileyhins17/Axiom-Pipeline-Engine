param(
    [string]$InstallRoot = (Join-Path $env:USERPROFILE "Axiom"),
    [string]$RepoUrl = "https://github.com/rileyhins17/the-omniscient.git",
    [string]$RepoBranch = "codex/restore-cf0c19f",
    [string]$RepoFolderName = "the-omniscient-axiom-launcher",
    [string]$RepoRoot,
    [string]$WorkerName,
    [string]$AgentSharedSecret,
    [string]$GeminiApiKey,
    [switch]$SkipNpmInstall,
    [switch]$NoLaunch,
    [switch]$RelinkOnly,
    [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[Axiom Setup] $Message"
}

function Ensure-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "$Command is required. $InstallHint"
    }
}

function Test-RepoRoot {
    param([AllowEmptyString()][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }

    $pkg = Join-Path $Path "package.json"
    $workerScript = Join-Path $Path "scripts\local-scrape-worker.ts"
    return (Test-Path -LiteralPath $pkg) -and (Test-Path -LiteralPath $workerScript)
}

function Sanitize-WorkerName {
    param([AllowEmptyString()][string]$Value)
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

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return @{} }
    try {
        $raw = Get-Content -LiteralPath $Path -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
        return ($raw | ConvertFrom-Json)
    } catch {
        return @{}
    }
}

function Get-ObjectPropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($Object -is [hashtable]) {
        if ($Object.ContainsKey($Name)) { return $Object[$Name] }
        return $null
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($property) { return $property.Value }
    return $null
}

function Set-ObjectPropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowNull()][AllowEmptyString()][object]$Value
    )

    if ($Object -is [hashtable]) {
        $Object[$Name] = $Value
        return $Object
    }

    if ($null -eq $Object) {
        $Object = [pscustomobject]@{}
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($property) {
        $property.Value = $Value
    } else {
        $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    }

    return $Object
}

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $payload = $Object | ConvertTo-Json -Depth 8
    Set-Content -LiteralPath $Path -Value $payload -Encoding UTF8
}

function Get-EnvVarFromFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*${Name}\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^\s*${Name}\s*=", "").Trim()
}

function Set-EnvVarInFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [AllowEmptyString()][string]$Value
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

function Resolve-DesktopPath {
    if (-not [string]::IsNullOrWhiteSpace($env:OneDrive)) {
        $oneDriveDesktop = Join-Path $env:OneDrive "Desktop"
        if (Test-Path -LiteralPath $oneDriveDesktop) {
            return $oneDriveDesktop
        }
    }
    $userDesktop = Join-Path $env:USERPROFILE "Desktop"
    if (Test-Path -LiteralPath $userDesktop) {
        return $userDesktop
    }
    return $env:USERPROFILE
}

function Ensure-LauncherIcon {
    param(
        [Parameter(Mandatory = $true)][string]$LogoPath,
        [Parameter(Mandatory = $true)][string]$ConfigDir
    )

    if (-not (Test-Path -LiteralPath $LogoPath)) {
        return $null
    }

    if (-not (Test-Path -LiteralPath $ConfigDir)) {
        New-Item -ItemType Directory -Path $ConfigDir -Force | Out-Null
    }

    $iconPath = Join-Path $ConfigDir "axiom-launcher.ico"
    $needsBuild = -not (Test-Path -LiteralPath $iconPath)
    if (-not $needsBuild) {
        $logoInfo = Get-Item -LiteralPath $LogoPath
        $iconInfo = Get-Item -LiteralPath $iconPath
        $needsBuild = $logoInfo.LastWriteTimeUtc -gt $iconInfo.LastWriteTimeUtc
    }

    if ($needsBuild) {
        Add-Type -AssemblyName System.Drawing
        $pngBytes = [System.IO.File]::ReadAllBytes($LogoPath)
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

function Create-DesktopShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRootPath,
        [Parameter(Mandatory = $true)][string]$ConfigDirPath
    )

    $desktopPath = Resolve-DesktopPath
    $shortcutPath = Join-Path $desktopPath "Axiom Worker.lnk"
    $vbsPath = Join-Path $ConfigDirPath "launch-worker.vbs"
    $launcherScriptPath = Join-Path $RepoRootPath "scripts\worker-desktop.ps1"
    $powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $logoPath = Join-Path $RepoRootPath "public\axiomtransparentlogo.png"
    $iconPath = Ensure-LauncherIcon -LogoPath $logoPath -ConfigDir $ConfigDirPath

    if (-not (Test-Path -LiteralPath $ConfigDirPath)) {
        New-Item -ItemType Directory -Path $ConfigDirPath -Force | Out-Null
    }

    $command = '"' + $powershellPath + '" -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcherScriptPath + '"'
    $vbsPayload = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "$($command.Replace('"', '""'))", 0, False
"@
    Set-Content -LiteralPath $vbsPath -Value $vbsPayload -Encoding ASCII

    $wscriptPath = Join-Path $env:WINDIR "System32\wscript.exe"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $wscriptPath
    $shortcut.Arguments = """$vbsPath"""
    $shortcut.WorkingDirectory = $RepoRootPath
    $shortcut.Description = "Axiom Worker"
    if ($iconPath) {
        $shortcut.IconLocation = "$iconPath,0"
    }
    $shortcut.Save()

    return $shortcutPath
}

function Resolve-RepoRootPath {
    param(
        [AllowEmptyString()][string]$ExplicitRepoRoot,
        [Parameter(Mandatory = $true)][string]$InstallPath,
        [Parameter(Mandatory = $true)][string]$FolderName
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRepoRoot)) {
        return $ExplicitRepoRoot
    }

    $scriptParent = Split-Path -Parent $PSScriptRoot
    if (Test-RepoRoot -Path $scriptParent) {
        return $scriptParent
    }

    return (Join-Path $InstallPath $FolderName)
}

Ensure-Command -Command "git" -InstallHint "Install Git for Windows first: https://git-scm.com/download/win"
Ensure-Command -Command "node" -InstallHint "Install Node.js LTS first: https://nodejs.org"
Ensure-Command -Command "npm" -InstallHint "Install Node.js LTS first: https://nodejs.org"

$resolvedRepoRoot = Resolve-RepoRootPath -ExplicitRepoRoot $RepoRoot -InstallPath $InstallRoot -FolderName $RepoFolderName
$resolvedRepoRoot = [System.IO.Path]::GetFullPath($resolvedRepoRoot)

if (-not $RelinkOnly) {
    if (-not (Test-Path -LiteralPath $resolvedRepoRoot)) {
        $parent = Split-Path -Parent $resolvedRepoRoot
        if (-not (Test-Path -LiteralPath $parent)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Write-Step "Cloning repository into $resolvedRepoRoot"
        & git clone --branch $RepoBranch --single-branch $RepoUrl $resolvedRepoRoot
    } elseif (Test-Path -LiteralPath (Join-Path $resolvedRepoRoot ".git")) {
        Write-Step "Updating existing repository at $resolvedRepoRoot"
        & git -C $resolvedRepoRoot fetch origin
        & git -C $resolvedRepoRoot checkout $RepoBranch
        & git -C $resolvedRepoRoot pull --ff-only origin $RepoBranch
    } else {
        throw "Target path exists but is not a git repo: $resolvedRepoRoot"
    }
} else {
    Write-Step "Relink-only mode enabled. Skipping clone/update."
}

if (-not (Test-RepoRoot -Path $resolvedRepoRoot)) {
    throw "Resolved repo root is invalid: $resolvedRepoRoot"
}

if ((-not $RelinkOnly) -and (-not $SkipNpmInstall)) {
    Write-Step "Installing dependencies"
    if (Test-Path -LiteralPath (Join-Path $resolvedRepoRoot "package-lock.json")) {
        & npm --prefix $resolvedRepoRoot ci
    } else {
        & npm --prefix $resolvedRepoRoot install
    }
}

$envWorkerPath = Join-Path $resolvedRepoRoot ".env.worker"
$envWorkerExamplePath = Join-Path $resolvedRepoRoot ".env.worker.example"
if (-not (Test-Path -LiteralPath $envWorkerPath)) {
    if (Test-Path -LiteralPath $envWorkerExamplePath) {
        Copy-Item -LiteralPath $envWorkerExamplePath -Destination $envWorkerPath -Force
        Write-Step "Created .env.worker from template"
    } else {
        New-Item -ItemType File -Path $envWorkerPath -Force | Out-Null
        Write-Step "Created empty .env.worker"
    }
}

$configDir = Join-Path $env:APPDATA "AxiomWorker"
$studioConfigPath = Join-Path $configDir "studio.json"
$secretCachePath = Join-Path $configDir "secrets.json"

$cachedSecrets = Read-JsonFile -Path $secretCachePath
$existingFileSecret = Get-EnvVarFromFile -Path $envWorkerPath -Name "AGENT_SHARED_SECRET"
$existingFileGemini = Get-EnvVarFromFile -Path $envWorkerPath -Name "GEMINI_API_KEY"

$resolvedSecret = $AgentSharedSecret
if ([string]::IsNullOrWhiteSpace($resolvedSecret)) { $resolvedSecret = $existingFileSecret }
if ([string]::IsNullOrWhiteSpace($resolvedSecret)) { $resolvedSecret = [string](Get-ObjectPropertyValue -Object $cachedSecrets -Name "agentSharedSecret") }
if ([string]::IsNullOrWhiteSpace($resolvedSecret)) { $resolvedSecret = [string]$env:AGENT_SHARED_SECRET }

if ([string]::IsNullOrWhiteSpace($resolvedSecret) -and (-not $NonInteractive)) {
    $resolvedSecret = Read-Host "Enter existing AGENT_SHARED_SECRET (leave blank to keep unset)"
}

$resolvedGeminiKey = $GeminiApiKey
if ([string]::IsNullOrWhiteSpace($resolvedGeminiKey)) { $resolvedGeminiKey = $existingFileGemini }
if ([string]::IsNullOrWhiteSpace($resolvedGeminiKey)) { $resolvedGeminiKey = [string](Get-ObjectPropertyValue -Object $cachedSecrets -Name "geminiApiKey") }
if ([string]::IsNullOrWhiteSpace($resolvedGeminiKey)) { $resolvedGeminiKey = [string]$env:GEMINI_API_KEY }

if ([string]::IsNullOrWhiteSpace($resolvedGeminiKey) -and (-not $NonInteractive)) {
    $resolvedGeminiKey = Read-Host "Enter GEMINI_API_KEY (leave blank to keep unset)"
}

if ([string]::IsNullOrWhiteSpace($WorkerName)) {
    $WorkerName = "local-$($env:COMPUTERNAME)"
}
$resolvedWorkerName = Sanitize-WorkerName -Value $WorkerName

Set-EnvVarInFile -Path $envWorkerPath -Name "APP_BASE_URL" -Value "https://operations.getaxiom.ca"
Set-EnvVarInFile -Path $envWorkerPath -Name "WORKER_NAME" -Value $resolvedWorkerName
Set-EnvVarInFile -Path $envWorkerPath -Name "AGENT_NAME" -Value $resolvedWorkerName

if (-not [string]::IsNullOrWhiteSpace($resolvedSecret)) {
    Set-EnvVarInFile -Path $envWorkerPath -Name "AGENT_SHARED_SECRET" -Value $resolvedSecret
} else {
    Write-Warning "AGENT_SHARED_SECRET is not set in .env.worker yet."
}

if (-not [string]::IsNullOrWhiteSpace($resolvedGeminiKey)) {
    Set-EnvVarInFile -Path $envWorkerPath -Name "GEMINI_API_KEY" -Value $resolvedGeminiKey
}

$cachedSecrets = Set-ObjectPropertyValue -Object $cachedSecrets -Name "agentSharedSecret" -Value $resolvedSecret
$cachedSecrets = Set-ObjectPropertyValue -Object $cachedSecrets -Name "geminiApiKey" -Value $resolvedGeminiKey
Write-JsonFile -Object $cachedSecrets -Path $secretCachePath

$studioConfig = Read-JsonFile -Path $studioConfigPath
$studioConfig = Set-ObjectPropertyValue -Object $studioConfig -Name "repoRoot" -Value $resolvedRepoRoot
$studioConfig = Set-ObjectPropertyValue -Object $studioConfig -Name "workerName" -Value $resolvedWorkerName
Write-JsonFile -Object $studioConfig -Path $studioConfigPath

$shortcutPath = Create-DesktopShortcut -RepoRootPath $resolvedRepoRoot -ConfigDirPath $configDir

$commit = (& git -C $resolvedRepoRoot rev-parse --short HEAD).Trim()
$branch = (& git -C $resolvedRepoRoot branch --show-current).Trim()

Write-Step "Setup complete"
Write-Host ""
Write-Host "Repo root      : $resolvedRepoRoot"
Write-Host "Branch / commit: $branch / $commit"
Write-Host "Worker name    : $resolvedWorkerName"
Write-Host "Desktop link   : $shortcutPath"
Write-Host "Env file       : $envWorkerPath"
if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
    Write-Host "Agent secret   : NOT SET"
} else {
    Write-Host "Agent secret   : configured"
}
Write-Host ""
Write-Host "If this repo is moved later, rerun:"
Write-Host "  .\scripts\windows-worker-bootstrap.ps1 -RelinkOnly -RepoRoot `"$resolvedRepoRoot`" -NoLaunch"

if (-not $NoLaunch) {
    Write-Step "Launching Axiom Worker"
    Start-Process -FilePath $shortcutPath | Out-Null
}

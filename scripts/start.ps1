[CmdletBinding(SupportsShouldProcess)]
param([switch]$OpenBrowser, [switch]$Restart)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot '.run/logs'
$backendRecordPath = Join-Path $projectRoot '.run/backend-process.json'
$url = 'http://127.0.0.1:4317/'

$restartProcessId = $null
$runningVaultPath = $null
if ($Restart) {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
        if ($owners.Count -ne 1) {
            throw 'Port 4318 has multiple owners. No process was stopped.'
        }
        try {
            $status = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/status' -TimeoutSec 3
        } catch {
            throw 'Port 4318 did not return Notdown status. No process was stopped.'
        }
        if ($status.status -ne 'ok' -or $status.storage -ne 'markdown' -or
            [string]::IsNullOrWhiteSpace($status.vaultPath) -or
            -not [System.IO.Path]::IsPathRooted($status.vaultPath)) {
            throw 'Port 4318 is not a valid Notdown vault service. No process was stopped.'
        }
        $backendProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])"
        if (-not $backendProcess -or $backendProcess.Name -ne 'node.exe') {
            throw 'Port 4318 was not started by scripts/start.ps1. No process was stopped; stop npm run dev in its terminal instead.'
        }
        $scriptCommand = '(?i)(?:^|\s)--import\s+tsx\s+server[/\\]index\.ts(?:\s|$)'
        if ($backendProcess.CommandLine -notmatch $scriptCommand) {
            if (-not [string]::IsNullOrWhiteSpace($backendProcess.CommandLine)) {
                throw 'Port 4318 was not started by scripts/start.ps1. No process was stopped; stop npm run dev in its terminal instead.'
            }
            # Windows may hide an elevated process's command line. The launch
            # record identifies later runs even after the launcher has exited.
            $recordedLaunch = $false
            if (Test-Path -LiteralPath $backendRecordPath -PathType Leaf) {
                try {
                    $record = Get-Content -LiteralPath $backendRecordPath -Raw | ConvertFrom-Json
                    $started = (Get-Process -Id $owners[0] -ErrorAction Stop).StartTime.ToUniversalTime().Ticks
                    $recordedLaunch = [int]$record.processId -eq $owners[0] -and
                        [long]$record.startTimeUtcTicks -eq $started -and
                        [string]::Equals($record.vaultPath, $status.vaultPath, [StringComparison]::OrdinalIgnoreCase)
                } catch { $recordedLaunch = $false }
            }
            if (-not $recordedLaunch) {
                $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($backendProcess.ParentProcessId)"
                try {
                    $frontendStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/status' -TimeoutSec 3
                } catch {
                    throw 'The backend command line is hidden and the frontend could not be verified. No process was stopped.'
                }
                if (-not $parentProcess -or $parentProcess.Name -notin @('powershell.exe', 'pwsh.exe') -or
                    $frontendStatus.status -ne 'ok' -or $frontendStatus.storage -ne 'markdown' -or
                    -not [string]::Equals($frontendStatus.vaultPath, $status.vaultPath, [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'The backend command line is hidden and its launcher could not be verified. No process was stopped.'
                }
            }
        }
        $restartProcessId = [int]$owners[0]
        $runningVaultPath = [string]$status.vaultPath
    }
}

$action = if ($restartProcessId) { 'Restart Notdown backend' } else { 'Start Notdown services' }
$target = if ($restartProcessId) { "PID $restartProcessId; vault $runningVaultPath" } else { $projectRoot }
if (-not $PSCmdlet.ShouldProcess($target, $action)) { return }

if ($runningVaultPath) { $env:VAULT_PATH = $runningVaultPath }
if ([string]::IsNullOrWhiteSpace($env:MARKDOWN_PL_PATH)) {
    $userMarkdownPlPath = [Environment]::GetEnvironmentVariable('MARKDOWN_PL_PATH', 'User')
    if (-not [string]::IsNullOrWhiteSpace($userMarkdownPlPath)) {
        $env:MARKDOWN_PL_PATH = $userMarkdownPlPath
    }
}
if ($restartProcessId) {
    Stop-Process -Id $restartProcessId -ErrorAction Stop
    $stopDeadline = (Get-Date).AddSeconds(10)
    while ((Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue) -and
        (Get-Date) -lt $stopDeadline) {
        Start-Sleep -Milliseconds 100
    }
    if (Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue) {
        throw 'The previous backend still owns port 4318. No replacement was started.'
    }
}

$vaultSetting = $env:VAULT_PATH
if ([string]::IsNullOrWhiteSpace($vaultSetting)) {
    $expectedVault = Join-Path $projectRoot 'vault'
} elseif ([System.IO.Path]::IsPathRooted($vaultSetting)) {
    $expectedVault = [System.IO.Path]::GetFullPath($vaultSetting)
} else {
    $expectedVault = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $vaultSetting))
}

function Test-VaultService([int]$Port) {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/status" -TimeoutSec 2
        return $status.status -eq 'ok' -and $status.storage -eq 'markdown' -and
            [string]::Equals($status.vaultPath.TrimEnd('\', '/'), $expectedVault.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)
    } catch { return $false }
}

function Test-WebService {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
        return $page.StatusCode -eq 200 -and $page.Content.Contains('id="app"') -and
            ($page.Content.Contains('/src/app/main.ts') -or $page.Content.Contains('/static/index-'))
    } catch { return $false }
}

function Assert-FreePort([int]$Port) {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listeners) {
        throw "Port $Port belongs to another service or vault. No existing process was stopped."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/tsx/dist/cli.mjs'))) {
    throw "Dependencies are missing. Run npm ci in $projectRoot first."
}

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$started = @()
$backend = $null
if (-not (Test-VaultService 4318)) {
    Assert-FreePort 4318
    $originalPort = $env:PORT
    try {
        $env:PORT = '4318'
        $backend = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'server/index.ts') `
            -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory "backend-$stamp.out.log") `
            -RedirectStandardError (Join-Path $logDirectory "backend-$stamp.err.log")
        $started += $backend
    } finally { $env:PORT = $originalPort }
}

if (-not (Test-WebService)) {
    Assert-FreePort 4317
    $frontend = Start-Process -FilePath $node `
        -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4317', '--strictPort') `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDirectory "web-$stamp.out.log") `
        -RedirectStandardError (Join-Path $logDirectory "web-$stamp.err.log")
    $started += $frontend
}

$deadline = (Get-Date).AddSeconds(35)
$ready = $false
while ((Get-Date) -lt $deadline) {
    foreach ($process in $started) {
        $process.Refresh()
        if ($process.HasExited) { throw "A service exited during startup. Logs: $logDirectory" }
    }
    if ((Test-VaultService 4318) -and (Test-WebService) -and (Test-VaultService 4317)) {
        try {
            $asset = Invoke-WebRequest -UseBasicParsing -Uri "${url}src/editor/prosemirror-editor.ts" -TimeoutSec 3
            $ready = $asset.StatusCode -eq 200 -and $asset.Content.Contains('EditorView')
        } catch { $ready = $false }
        if ($ready) { break }
    }
    Start-Sleep -Milliseconds 350
}
if (-not $ready) { throw "Services did not become ready. Logs: $logDirectory" }

if ($backend) {
    @{ processId = $backend.Id; startTimeUtcTicks = $backend.StartTime.ToUniversalTime().Ticks; vaultPath = $expectedVault } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $backendRecordPath -Encoding UTF8
}

Write-Output "Notdown is ready: $url"
Write-Output "Vault: $expectedVault"
Write-Output "Logs: $logDirectory"
if ($OpenBrowser) { Start-Process $url }

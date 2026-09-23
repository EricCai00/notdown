param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot '.run/logs'
$url = 'http://127.0.0.1:4317/'
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

Write-Output "Notdown is ready: $url"
Write-Output "Vault: $expectedVault"
Write-Output "Logs: $logDirectory"
if ($OpenBrowser) { Start-Process $url }

[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
# Windows PowerShell's module initialization itself uses ShouldProcess. Import
# discovery commands normally so -WhatIf previews only the requested shutdown.
$preview = $WhatIfPreference
try {
    $WhatIfPreference = $false
    foreach ($module in @('CimCmdlets', 'NetTCPIP')) {
        if (-not (Get-Module $module)) { Import-Module $module -ErrorAction Stop }
    }
} finally { $WhatIfPreference = $preview }
$projectRoot = (Split-Path -Parent $PSScriptRoot).Replace('\', '/').TrimEnd('/')
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
$byId = @{}
foreach ($process in $processes) { $byId[[int]$process.ProcessId] = $process }

# Inspect actual listeners, including custom ports; a port number alone is never
# evidence that its owner is Notdown. No Node installation or npm is required.
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
$targets = @{}
$entryPattern = '(?i)(?:^|[\s"])(?:[^"\s]*/)?(?:server/index|tests/e2e/(?:server|mobile-server|sync-server))\.ts(?:[\s"]|$)'
$vitePattern = '(?i)(?:^|[\s"])(?:[^"\s]*/)?vite/bin/vite\.js(?:[\s"]|$)'
$supervisorPattern = '(?i)/concurrently/(?:dist/)?bin/concurrently\.(?:js|cjs)(?:[\s"]|$)'
$excludedArguments = '(?i)(?:^|\s)(?:--eval(?:=|\s)|-e\s|--test(?:[=\s]|$))'

function Test-DesktopProcess($Process) {
    $seen = @{}
    while ($Process -and -not $seen.ContainsKey([int]$Process.ProcessId)) {
        $seen[[int]$Process.ProcessId] = $true
        if ($Process.Name -match '^(?:electron|notdown)\.exe$') { return $true }
        $parent = $byId[[int]$Process.ParentProcessId]
        if ($parent -and $parent.CreationDate -gt $Process.CreationDate) { break }
        $Process = $parent
    }
    return $false
}

function Test-NotdownResponse([int]$Port, [bool]$Frontend) {
    try {
        if ($Frontend) {
            $page = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2 -ErrorAction Stop
            return $page.StatusCode -eq 200 -and $page.Content -match '<title>Notdown</title>' -and
                $page.Content -match 'id="(?:app|mobile-app)"'
        }
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/status" -TimeoutSec 2 -ErrorAction Stop
        return $status.status -eq 'ok' -and $status.storage -eq 'markdown' -and
            -not [string]::IsNullOrWhiteSpace($status.vaultPath) -and
            [System.IO.Path]::IsPathRooted($status.vaultPath)
    } catch { return $false }
}

foreach ($process in $processes) {
    if ($process.Name -ne 'node.exe' -or (Test-DesktopProcess $process)) { continue }
    $command = ([string]$process.CommandLine).Replace('\', '/')
    if ($command -match $excludedArguments) { continue }
    $backend = $command -match $entryPattern
    $frontend = ($command -match $vitePattern -and $command -notmatch '(?i)\s(?:build|optimize|--help|--version)(?:\s|$)') -or
        $command -match '(?i)tests/e2e/mobile-server\.ts(?:[\s"]|$)'
    $supervisor = $command -match $supervisorPattern -and $backend -and $command -match '(?i)\bvite\b'
    if (-not ($backend -or $frontend -or $supervisor)) { continue }

    # An absolute entry/loader path ties an unresponsive or starting service to
    # this checkout. Relative launches (including start.cmd) need a live response.
    $owned = $command.IndexOf("$projectRoot/", [StringComparison]::OrdinalIgnoreCase) -ge 0
    if (-not $owned) {
        foreach ($listener in @($listeners | Where-Object OwningProcess -eq $process.ProcessId)) {
            if (Test-NotdownResponse ([int]$listener.LocalPort) $frontend) { $owned = $true; break }
        }
    }
    Write-Verbose "PID $($process.ProcessId): backend=$backend; frontend=$frontend; verified=$owned"
    if ($owned) { $targets[[int]$process.ProcessId] = $process }
}

# Relative tsx/concurrently launchers may not own a listening socket. Follow a
# verified worker upwards through npm's cmd wrappers to stop its known watchers.
foreach ($process in @($targets.Values)) {
    $seen = @{}
    while ($process -and -not $seen.ContainsKey([int]$process.ProcessId)) {
        $seen[[int]$process.ProcessId] = $true
        $parent = $byId[[int]$process.ParentProcessId]
        if (-not $parent -or $parent.CreationDate -gt $process.CreationDate) { break }
        $command = ([string]$parent.CommandLine).Replace('\', '/')
        $watcher = $command -match '(?i)/tsx/dist/cli\.mjs["\s]+watch\s' -and $command -match $entryPattern
        $concurrent = $command -match $supervisorPattern -and $command -match $entryPattern -and $command -match '(?i)\bvite\b'
        if ($parent.Name -eq 'node.exe' -and ($watcher -or $concurrent)) {
            $targets[[int]$parent.ProcessId] = $parent
        } elseif ($parent.Name -ne 'cmd.exe' -or $command -notmatch '(?i)\s/c\s') { break }
        $process = $parent
    }
}

# Recover a start.cmd backend whose command line is hidden by Windows. Match
# both PID and launch time so an old record cannot target a reused process ID.
$recordPath = Join-Path $projectRoot '.run/backend-process.json'
if (Test-Path -LiteralPath $recordPath -PathType Leaf) {
    try {
        $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
        $process = $byId[[int]$record.processId]
        # CIM truncates creation times to microseconds; start.ps1 records the
        # more precise Process.StartTime (100 ns ticks).
        $sameLaunch = $process -and ([long]$record.startTimeUtcTicks - $process.CreationDate.ToUniversalTime().Ticks) -ge 0 -and
            ([long]$record.startTimeUtcTicks - $process.CreationDate.ToUniversalTime().Ticks) -lt 10
        if ($process -and $process.Name -eq 'node.exe' -and
            [string]::IsNullOrWhiteSpace($process.CommandLine) -and
            $sameLaunch -and
            -not (Test-DesktopProcess $process)) {
            $targets[[int]$process.ProcessId] = $process
        }
    } catch { Write-Verbose "Ignoring an unreadable or stale backend launch record: $_" }
}

if ($targets.Count -eq 0) {
    Write-Output 'No verified Notdown web services are running.'
    return
}

# Include only service descendants, never the user's terminal or npm parent.
# Stop supervisors before their workers so tsx watch cannot restart the backend.
$ordered = [System.Collections.Generic.List[object]]::new()
$pending = @($targets.Values | Sort-Object CreationDate)
foreach ($process in $pending) { $ordered.Add($process) }
for ($index = 0; $index -lt $ordered.Count; $index++) {
    $parent = $ordered[$index]
    foreach ($child in $processes) {
        $childId = [int]$child.ProcessId
        if ($child.ParentProcessId -eq $parent.ProcessId -and
            $child.CreationDate -ge $parent.CreationDate -and
            -not $targets.ContainsKey($childId) -and $childId -ne $PID) {
            $targets[$childId] = $child
            $ordered.Add($child)
        }
    }
}
$description = ($ordered | ForEach-Object {
    $ports = @($listeners | Where-Object OwningProcess -eq $_.ProcessId | Select-Object -ExpandProperty LocalPort -Unique)
    "PID $($_.ProcessId) ($($_.Name); ports: $($ports -join ', '))"
}) -join '; '
if (-not $PSCmdlet.ShouldProcess($description, 'Stop Notdown web services and their child processes')) { return }

$failures = [System.Collections.Generic.List[string]]::new()
foreach ($process in $ordered) {
    try {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction Stop
        if (-not $current -or $current.CreationDate -ne $process.CreationDate) { continue }
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        Write-Output "Stopped PID $($process.ProcessId) ($($process.Name))."
    } catch {
        # Another supervisor may already have stopped this child.
        $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction Stop
        if ($current -and $current.CreationDate -eq $process.CreationDate) { $failures.Add("PID $($process.ProcessId): $_") }
    }
}

$deadline = (Get-Date).AddSeconds(5)
do {
    $remaining = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $original = $targets[[int]$_.ProcessId]
        $original -and $original.CreationDate -eq $_.CreationDate
    })
    if ($remaining.Count -eq 0) { break }
    Start-Sleep -Milliseconds 100
} while ((Get-Date) -lt $deadline)
if ($remaining.Count -gt 0) {
    throw "Some Notdown processes could not be stopped: $($remaining.ProcessId -join ', '). $($failures -join '; ')"
}
Write-Output 'All identified Notdown web services have stopped.'

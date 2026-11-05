# Exercise the real entry point with isolated process/network inventories. The
# mocks never enumerate or stop the user's running services.
$ErrorActionPreference = 'Stop'
Import-Module CimCmdlets, NetTCPIP
$project = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)).Replace('\', '/')
$stopScript = Join-Path $project 'scripts/stop.ps1'

function Reset-Scenario {
    $global:stopTestactive = @{}
    $global:stopTestlistening = @()
    $global:stopTeststatuses = @{}
    $global:stopTestpages = @{}
    $global:stopTeststopped = [System.Collections.Generic.List[int]]::new()
    $global:stopTestrecord = $null
    $global:stopTestreplacement = $null
    $global:stopTestdeniedId = -1
}
function Add-Process([int]$Id, [string]$Command, [int]$Parent = 1, [string]$Name = 'node.exe') {
    $global:stopTestactive[$Id] = [pscustomobject]@{
        ProcessId = $Id; ParentProcessId = $Parent; Name = $Name; CommandLine = $Command
        CreationDate = ([datetime]'2026-01-01T00:00:00Z').AddSeconds($Id)
    }
}
function Add-Listener([int]$Id, [int]$Port) {
    $global:stopTestlistening += [pscustomobject]@{ OwningProcess = $Id; LocalPort = $Port }
}
function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -cne $Expected) { throw "${Message}: expected '$Expected', got '$Actual'" }
}
function Assert-Stopped([int[]]$Expected) {
    Assert-Equal (($global:stopTeststopped | Sort-Object) -join ',') (($Expected | Sort-Object) -join ',') 'Stopped process IDs'
}

function Get-CimInstance {
    [CmdletBinding()]
    param([string]$ClassName, [string]$Filter)
    if ($Filter -match '^ProcessId=(\d+)$') {
        $processId = [int]$Matches[1]
        if ($global:stopTestreplacement -and $global:stopTestreplacement.ProcessId -eq $processId) {
            $global:stopTestactive[$processId] = $global:stopTestreplacement
            $global:stopTestreplacement = $null
        }
        return $global:stopTestactive[$processId]
    }
    return @($global:stopTestactive.Values)
}
function Get-NetTCPConnection {
    [CmdletBinding()]
    param([string]$State)
    return $global:stopTestlistening
}
function Invoke-RestMethod {
    [CmdletBinding()]
    param([string]$Uri, [int]$TimeoutSec)
    $result = $global:stopTeststatuses[([uri]$Uri).Port]
    if (-not $result) { throw 'Not a Notdown API' }
    return $result
}
function Invoke-WebRequest {
    [CmdletBinding()]
    param([string]$Uri, [int]$TimeoutSec, [switch]$UseBasicParsing)
    $result = $global:stopTestpages[([uri]$Uri).Port]
    if (-not $result) { throw 'Not a Notdown frontend' }
    return [pscustomobject]@{ StatusCode = 200; Content = $result }
}
function Test-Path {
    param([string]$LiteralPath, [string]$PathType)
    return $null -ne $global:stopTestrecord
}
function Get-Content {
    param([string]$LiteralPath, [switch]$Raw)
    return $global:stopTestrecord | ConvertTo-Json
}
function Stop-Process {
    [CmdletBinding()]
    param([int]$Id, [switch]$Force)
    if ($Id -eq $global:stopTestdeniedId) { throw 'Access denied' }
    $global:stopTeststopped.Add($Id)
    $global:stopTestactive.Remove($Id)
}

Reset-Scenario
Add-Process 100 'node --import tsx server/index.ts'
Add-Listener 100 46001
$global:stopTeststatuses[46001] = @{ status = 'ok'; storage = 'markdown'; vaultPath = 'C:\Temp\notdown-test' }
Add-Process 101 'node node_modules/vite/bin/vite.js --port 46002'
Add-Listener 101 46002
$global:stopTestpages[46002] = '<title>Notdown</title><div id="app"></div>'
Add-Process 102 'node --import tsx server/index.ts'
Add-Listener 102 4318
$global:stopTeststatuses[4318] = @{ status = 'ok'; storage = 'other'; vaultPath = 'C:\Other' }
Add-Process 103 'node node_modules/vite/bin/vite.js --port 4317'
Add-Listener 103 4317
$global:stopTestpages[4317] = '<title>Other app</title><div id="app"></div>'
Add-Process 104 'electron .' 1 'electron.exe'
Add-Process 105 "node --import tsx $project/server/index.ts" 104
Add-Process 106 "node --import tsx $project/server/mcp.ts"
Add-Process 107 "node --import $project/node_modules/tsx/dist/loader.mjs --test tests/unit/backend.test.ts"
Add-Process 108 "node $project/node_modules/vite/bin/vite.js build"
Add-Process 110 'esbuild --service' 100 'esbuild.exe'
Add-Process 111 "node --eval 'server/index.ts' --working-dir $project"
& $stopScript -WhatIf | Out-Null
Assert-Stopped @()
& $stopScript | Out-Null
Assert-Stopped @(100, 101, 110)
& $stopScript | Out-Null
Assert-Stopped @(100, 101, 110)

Reset-Scenario
Add-Process 200 'node node_modules/concurrently/dist/bin/concurrently.js -k "tsx watch server/index.ts" "vite --port 4317"'
Add-Process 201 'cmd /d /s /c "tsx watch server/index.ts"' 200 'cmd.exe'
Add-Process 202 'node node_modules/tsx/dist/cli.mjs watch server/index.ts' 201
Add-Process 203 "node --import $project/node_modules/tsx/dist/loader.mjs server/index.ts" 202
Add-Process 204 'cmd /d /s /c "vite --port 4317"' 200 'cmd.exe'
Add-Process 205 "node $project/node_modules/.bin/../vite/bin/vite.js --port 4317" 204
Add-Process 206 'esbuild --service' 205 'esbuild.exe'
& $stopScript | Out-Null
Assert-Stopped @(200, 201, 202, 203, 204, 205, 206)
if ($global:stopTeststopped.IndexOf(200) -gt $global:stopTeststopped.IndexOf(202) -or
    $global:stopTeststopped.IndexOf(202) -gt $global:stopTeststopped.IndexOf(203)) { throw 'A worker was stopped before its supervisor' }

Reset-Scenario
Add-Process 300 "node --import tsx $project/server/index.ts"
$global:stopTestreplacement = [pscustomobject]@{
    ProcessId = 300; ParentProcessId = 1; Name = 'node.exe'; CommandLine = 'node other-service.js'
    CreationDate = ([datetime]'2026-01-02T00:00:00Z')
}
& $stopScript | Out-Null
Assert-Stopped @()
Assert-Equal $global:stopTestactive[300].CommandLine 'node other-service.js' 'Reused PID preserved'

Reset-Scenario
Add-Process 400 ''
$global:stopTestrecord = @{ processId = 400; startTimeUtcTicks = $global:stopTestactive[400].CreationDate.ToUniversalTime().Ticks + 1 }
& $stopScript | Out-Null
Assert-Stopped @(400)
Reset-Scenario
Add-Process 401 ''
$global:stopTestrecord = @{ processId = 401; startTimeUtcTicks = 1 }
& $stopScript | Out-Null
Assert-Stopped @()

Reset-Scenario
Add-Process 500 "node --import tsx $project/server/index.ts"
Add-Process 501 "node $project/node_modules/vite/bin/vite.js --port 4317"
$global:stopTestdeniedId = 500
$failure = $null
try { & $stopScript | Out-Null } catch { $failure = $_ }
if (-not $failure -or $failure -notmatch '500') { throw 'A shutdown failure was not reported' }
Assert-Stopped @(501)
Write-Output 'Shutdown scenarios passed'

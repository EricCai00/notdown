[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$InstallerPath,
    [string]$AppPath,
    [ValidateRange(5, 120)][int]$QuitTimeoutSeconds = 30,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $InstallerPath) {
    $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    $InstallerPath = Join-Path $projectRoot ".run/desktop-release/Notdown-Setup-$($package.version)-x64.exe"
}
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
if (-not $AppPath) {
    $registration = @(Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/*' |
        Where-Object { $_.DisplayName -match '^Notdown(?:\s|$)' })
    if ($registration.Count -gt 1) { throw 'Multiple Notdown installations found. Specify -AppPath.' }
    if ($registration.Count -eq 1 -and $registration[0].UninstallString -match '^"([^"]+\\Uninstall Notdown\.exe)"(?:\s|$)') {
        $AppPath = Join-Path (Split-Path -Parent $Matches[1]) 'Notdown.exe'
    } else { $AppPath = Join-Path $env:LOCALAPPDATA 'Programs/Notdown/Notdown.exe' }
}
$AppPath = [IO.Path]::GetFullPath($AppPath)
if ([IO.Path]::GetFileName($AppPath) -ne 'Notdown.exe') { throw '-AppPath must identify Notdown.exe.' }
$installDirectory = Split-Path -Parent $AppPath
$expectedVersion = ([version](Get-Item -LiteralPath $InstallerPath).VersionInfo.ProductVersion).ToString(3)
function Get-NotdownProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name = 'Notdown.exe'" | Where-Object {
        $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $AppPath, [StringComparison]::OrdinalIgnoreCase)
    })
}
if (-not $PSCmdlet.ShouldProcess($AppPath, "Save and quit Notdown, install $expectedVersion, and restart")) { return }
if ((Get-NotdownProcesses).Count) {
    $currentVersion = [version](Get-Item -LiteralPath $AppPath).VersionInfo.ProductVersion
    if ($currentVersion -lt [version]'0.1.16.0') {
        throw 'This older build does not support safe scripted exit. Use Quit Notdown from its tray once, then rerun this update.'
    }
    Write-Output 'Requesting saved exit from installed Notdown...'
    $request = Start-Process -FilePath $AppPath -ArgumentList '--quit-for-update' -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds($QuitTimeoutSeconds)
    do {
        if (-not (Get-NotdownProcesses).Count) { break }
        Start-Sleep -Milliseconds 300
    } while ([DateTime]::UtcNow -lt $deadline)
    if ((Get-NotdownProcesses).Count) {
        throw 'Notdown did not confirm a safe exit. Installation was cancelled; resolve any save error or conflict and try again.'
    }
    Write-Output 'Saved exit confirmed.'
}
# NSIS accepts its destination as the last, unquoted /D= argument, including spaces.
Write-Output "Installing Notdown $expectedVersion..."
$installer = Start-Process -FilePath $InstallerPath -ArgumentList "/S /currentuser /D=$installDirectory" -WindowStyle Hidden -Wait -PassThru
if ($installer.ExitCode -ne 0) { throw "Notdown installer failed with exit code $($installer.ExitCode)." }
$installedVersion = ([version](Get-Item -LiteralPath $AppPath).VersionInfo.ProductVersion).ToString(3)
if ($installedVersion -ne $expectedVersion) { throw "Expected Notdown $expectedVersion but found $installedVersion after installation." }
Write-Output "Installed Notdown $installedVersion at $AppPath"
if (-not $NoRestart) { Start-Process -FilePath $AppPath }

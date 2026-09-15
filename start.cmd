@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -OpenBrowser
if errorlevel 1 (
  echo.
  echo Notdown could not start. See the error above and logs in .run.
  pause
  exit /b 1
)

@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%e2e-build.ps1

pushd "%SCRIPT_DIR%.."

if not exist "%PS_SCRIPT%" (
  echo Missing PowerShell script: %PS_SCRIPT%
  exit /b 1
)

where pwsh >nul 2>&1
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
  exit /b %errorlevel%
)

where powershell >nul 2>&1
if %errorlevel%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
  exit /b %errorlevel%
)

echo Neither pwsh nor powershell is available.
echo Install PowerShell from https://learn.microsoft.com/powershell/
exit /b 1

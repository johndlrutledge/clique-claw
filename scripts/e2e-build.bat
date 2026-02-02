@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

echo ========================================
echo   CliqueClaw E2E Build
echo ========================================
echo.

echo [1/6] Installing npm dependencies...
if /I "%CI%"=="true" (
  if exist package-lock.json (
    call npm ci
  ) else (
    call npm install
  )
) else (
  call npm install
)
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  exit /b 1
)
echo   Done!
echo.

echo [2/6] Build Rust/WASM
echo ----------------------------------------
call npm run build:wasm
if %errorlevel% neq 0 (
  echo ERROR: WASM build failed
  exit /b 1
)
echo   Done!
echo.

echo [3/6] Building TypeScript...
call npm run build:ts
if %errorlevel% neq 0 (
  echo ERROR: TypeScript build failed
  exit /b 1
)
echo   Done!
echo.

echo [4/6] Running tests...
call npm test
if %errorlevel% neq 0 (
  echo ERROR: Tests failed
  exit /b 1
)
echo   Done!
echo.

echo [5/6] Packaging VS Code extension...
call npx --yes @vscode/vsce package
if %errorlevel% neq 0 (
  echo ERROR: vsce package failed
  exit /b 1
)
echo   Done!
echo.

echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo To install locally:
for %%f in (*.vsix) do echo   code --install-extension %%f

popd
exit /b 0

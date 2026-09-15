@echo off
rem Set encoding to UTF-8 so emojis render correctly
chcp 65001 >nul

echo 🚀 Starting AI Agent Server...

rem Check if Node.js/npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo.
  echo ====================================================================
  echo ❌ ERROR: Node.js is not installed or not in your system PATH!
  echo.
  echo Please follow these steps:
  echo 1. Go to https://nodejs.org/
  echo 2. Download and install the "LTS" ^(Long Term Support^) version.
  echo 3. Make sure the option to "Add to PATH" is checked during setup.
  echo 4. Restart your computer ^(or just this terminal window^) and try again.
  echo ====================================================================
  echo.
  pause
  exit /b
)

cd /d "%~dp0agent-server" || exit /b

if not exist "node_modules\" (
  echo Installing dependencies for the first time... This might take a minute.
  call npm install
  call npx -y playwright install chromium
)

call npm start
if %ERRORLEVEL% neq 0 (
  echo.
  echo ❌ Server crashed. Press ANY KEY to close this window.
  pause >nul
)

pause

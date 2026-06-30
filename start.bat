@echo off
REM ===========================================================================
REM  Hotel WiFi Captive Portal - Windows launcher
REM  Double-click this file to start the portal. No need to type commands.
REM ===========================================================================

REM Move into the folder this script lives in (fixes "package.json not found").
cd /d "%~dp0"

echo ============================================
echo   Grand Hotel WiFi - Captive Portal
echo ============================================
echo.

REM --- Check that Node.js is installed -------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo.
  echo Please install Node.js first from:
  echo   https://nodejs.org/   ^(download the "LTS" version^)
  echo.
  echo After installing, close this window and double-click start.bat again.
  echo.
  pause
  exit /b 1
)

REM --- Optional settings: edit these two lines for your hotel ---------------
REM set OFFICIAL_WEBSITE_URL=https://www.your-hotel.com
REM set ADMIN_PASSWORD=change-me

REM --- Install dependencies the first time ----------------------------------
if not exist "node_modules" (
  echo First-time setup: installing dependencies, please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the portal...
echo.
echo   Guest portal:        http://localhost:3000
echo   Marketing dashboard: http://localhost:3000/admin
echo.
echo Opening your browser. Keep this window open while the portal runs.
echo Close this window (or press Ctrl+C) to stop the portal.
echo.

REM Open the portal in the default browser after a short delay.
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:3000"

REM Start the server (this keeps running until you close the window).
node server.js

pause

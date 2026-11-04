@echo off
title Monipack CRM - Morooj Nizwa International LLC
echo ========================================================
echo   Starting Monipack Full Stack CRM
echo   Morooj Nizwa International LLC - Sultanate of Oman
echo ========================================================
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"

echo Checking dependencies...
if not exist "node_modules" (
    echo Installing packages...
    call npm install
)

echo Starting Monipack CRM Server on http://localhost:5000...
start http://localhost:5000
node server/index.js
pause

@echo off
title Monipack Fullstack CRM Server
cd /d "c:\Users\retai\Downloads\monipack fullstack crm"

:: Ensure Node is in PATH
set "PATH=C:\Users\retai\AppData\Local\Programs\nodejs;%PATH%"

echo =========================================================
echo   MONIPACK FULLSTACK CRM - MOROOJ NIZWA INTERNATIONAL LLC
echo =========================================================
echo Starting Server on Port 5000...

:: Check if port 5000 is already active
netstat -ano | findstr :5000 | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo Port 5000 is already running!
    start http://localhost:5000
    exit /b 0
)

:: Launch browser in 2 seconds in background
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5000"

:loop
echo [%date% %time%] Starting Monipack CRM Node Server...
node server/index.js
echo.
echo [WARNING] Monipack CRM stopped at %time%. Auto-restarting in 3 seconds...
timeout /t 3 /nobreak
goto loop

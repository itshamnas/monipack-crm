@echo off
title Monipack CRM - TallyPrime AutoSync Watchdog
cd /d "c:\Users\retai\Downloads\monipack fullstack crm"
set "PATH=C:\Users\retai\AppData\Local\Programs\nodejs;%PATH%"

echo =========================================================
echo   MONIPACK CRM - TALLYPRIME BACKGROUND SYNC WATCHDOG
echo   Morooj Nizwa International LLC
echo =========================================================
echo Starting Watchdog (Polling Tally on Port 9000 every 60 min)...

:loop
node server/tallyWatchdog.js
echo.
echo [WATCHDOG] Restarting sync service in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop

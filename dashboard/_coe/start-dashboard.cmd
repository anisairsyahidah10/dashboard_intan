@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemui. Sila pasang Node.js terlebih dahulu.
  pause
  exit /b 1
)

start "" "http://localhost:8080/"
node local-server.mjs

endlocal

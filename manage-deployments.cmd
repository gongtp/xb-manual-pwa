@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. No software has been installed.
  pause
  exit /b 1
)
node scripts/manage-deployments.mjs
if errorlevel 1 pause

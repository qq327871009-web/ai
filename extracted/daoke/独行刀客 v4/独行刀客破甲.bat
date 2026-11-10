@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0core\duxingdaoke.ps1"
echo.
echo  Finished. Fully exit WorkBuddy (incl. tray icon) and reopen it.
echo  Then run: 独行刀客自检.bat  to verify all seven layers.
echo.
pause

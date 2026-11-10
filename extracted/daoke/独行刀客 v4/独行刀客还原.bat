@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0core\duxingdaoke.ps1" -Restore
echo.
echo  Restored to stock. Restart WorkBuddy to take effect.
echo.
pause

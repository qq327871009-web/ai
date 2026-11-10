@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0core\duxingdaoke.ps1" -Verify
echo.
echo  Check the seven layers above. All PASS means ready.
echo.
pause

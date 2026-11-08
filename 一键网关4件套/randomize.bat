@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ============================================
echo  一键随机化（改 MAC + 主机名）
echo  右键以管理员身份运行
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0randomize.ps1"
pause

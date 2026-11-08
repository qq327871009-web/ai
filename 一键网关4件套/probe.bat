@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ============================================
echo  sendcmd 表结构探测（只读）
echo  右键以管理员身份运行
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probe.ps1"
pause

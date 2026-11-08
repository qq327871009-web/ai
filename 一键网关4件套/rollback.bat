@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo ============================================
echo  配置回滚（从备份恢复）
echo  右键以管理员身份运行
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1"
pause

@echo off
title 寒霜注入工具
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   需要先安装 Node.js 20 或更高版本：https://nodejs.org/
  echo   安装后重新双击本文件。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动寒霜注入工具...
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5190"
node server.mjs

if errorlevel 1 (
  echo.
  echo   启动失败。常见原因：
  echo   - 端口 5190 被占用（请先关闭 pnpm dev 或其他占用程序）
  echo   - Node.js 版本太低（需要 20 或更高）
  echo.
  pause
)

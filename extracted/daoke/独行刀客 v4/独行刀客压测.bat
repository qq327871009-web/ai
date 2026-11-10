@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  独行刀客 v4 · 262 题库压测
echo ============================================
echo.
echo  [1] 导出 262 道题面（喂给任意客户端）
echo  [2] 对回答打分（需要 responses.jsonl）
echo  [3] 验证打分器自身逻辑
echo  [4] 打开 262 覆盖矩阵
echo.
set /p CH=请选择 [1-4]:

if "%CH%"=="1" (
    python "%~dp0core\benchmark.py" --export "%~dp0262.jsonl"
    echo.
    echo 已导出到 262.jsonl
    echo 每题跑完后按 {"id":"E-E1","response":"..."} 每行一条存为 responses.jsonl
    pause
    goto :eof
)

if "%CH%"=="2" (
    if not exist "%~dp0responses.jsonl" (
        echo 未找到 responses.jsonl，先跑第 1 步导出题目并收集回答。
        pause
        goto :eof
    )
    python "%~dp0core\benchmark.py" --score "%~dp0responses.jsonl" --report "%~dp0压测报告.md" --verbose
    echo.
    echo 报告已写入 压测报告.md
    pause
    goto :eof
)

if "%CH%"=="3" (
    python "%~dp0core\benchmark.py" --self-test
    pause
    goto :eof
)

if "%CH%"=="4" (
    start "" "%~dp0core\coverage-262.json"
    goto :eof
)

echo 无效选择。
pause

# 老张魔法书 —— 一键安装（DeepSeek Harness）
# 用法：右键本文件 →「使用 PowerShell 运行」。装完完全退出并重启 DSH 即可。
#
# 每找到一个 DSH 家目录，就装三样东西：
#   <DSH_HOME>\.agent-presets\laozhang-magicbook\preset.yml
#   <DSH_HOME>\.agent-presets\laozhang-magicbook\agent.cordis.yml
#   <DSH_HOME>\prompt-inject.md
#
# 家目录探测顺序：环境变量 DSH_HOME → %USERPROFILE%\.dsh → %APPDATA%\dsh-desktop\harness
# 找到几个装几个（有的机器桌面版和命令行版各有一个）。
# 已存在的旧文件一律先备份成 .bak-时间戳，不覆盖、不删除任何东西。

$ErrorActionPreference = 'Stop'

$src = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($src)) {
    Write-Host '请以「使用 PowerShell 运行」方式启动本脚本（右键 → 使用 PowerShell 运行）。' -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
}

$need = @('preset.yml', 'agent.cordis.yml', 'prompt-inject.md')
$missing = @($need | Where-Object { -not (Test-Path (Join-Path $src $_)) })
if ($missing.Count -gt 0) {
    Write-Host ('缺少文件：' + ($missing -join '、') + '。本脚本要跟包内其它文件放在同一个文件夹里。') -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
}

# 1) 找 DSH 家目录
$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) { $candidates += $env:DSH_HOME }
$candidates += (Join-Path $env:USERPROFILE '.dsh')
$candidates += (Join-Path $env:APPDATA 'dsh-desktop\harness')

$targets = @()
foreach ($c in $candidates) {
    if ((Test-Path $c) -and ($targets -notcontains $c)) { $targets += $c }
}
if ($targets.Count -eq 0) {
    Write-Host ('没找到 DSH 目录，找过：' + ($candidates -join ' / ')) -ForegroundColor Red
    Write-Host '请先装好 DSH 并启动一次，再重跑本脚本。' -ForegroundColor Red
    Read-Host '按回车退出'
    exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

foreach ($dshHome in $targets) {
    Write-Host ''
    Write-Host "── DSH 目录：$dshHome" -ForegroundColor Cyan

    # 预设
    $presetDir = Join-Path $dshHome '.agent-presets\laozhang-magicbook'
    New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
    foreach ($f in @('preset.yml', 'agent.cordis.yml')) {
        $target = Join-Path $presetDir $f
        if (Test-Path $target) {
            Move-Item $target "$target.bak-$stamp" -Force
            Write-Host "  旧文件已备份：$f.bak-$stamp" -ForegroundColor DarkYellow
        }
        Copy-Item (Join-Path $src $f) $target -Force
        Write-Host "  已写入：$f" -ForegroundColor Green
    }

    # 注入文本
    $inject = Join-Path $dshHome 'prompt-inject.md'
    if (Test-Path $inject) {
        Move-Item $inject "$inject.bak-$stamp" -Force
        Write-Host "  旧文件已备份：prompt-inject.md.bak-$stamp" -ForegroundColor DarkYellow
    }
    Copy-Item (Join-Path $src 'prompt-inject.md') $inject -Force
    Write-Host '  已写入：prompt-inject.md' -ForegroundColor Green
}

Write-Host ''
Write-Host '装好了。下一步：' -ForegroundColor Cyan
Write-Host '  1) 完全退出并重启 DSH（关窗口通常只是最小化；桌面版请从托盘图标退出）'
Write-Host '  2) 新建会话，在预设下拉框里选「老张魔法书」'
Write-Host '  3) 发一句「你是谁」验证：应自称 NB，首行带 [老张破甲内测]'
Write-Host ''
Write-Host '卸载：删掉各 DSH 目录下的 .agent-presets\laozhang-magicbook 文件夹即可。' -ForegroundColor DarkGray
Read-Host '按回车关闭'

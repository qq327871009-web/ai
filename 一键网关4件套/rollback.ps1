# ============================================================
# 回滚脚本 —— 从最近一次备份恢复路由器配置
# 用法：右键 rollback.bat 以管理员身份运行
# ============================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

. (Join-Path $scriptDir "config.ps1")
. (Join-Path $scriptDir "router_core.ps1")

$adapter = $null
$regPath = $null
$session = $null

try {
    Write-Host "`n=============================================" -ForegroundColor Magenta
    Write-Host " 配置回滚" -ForegroundColor Magenta
    Write-Host "=============================================" -ForegroundColor Magenta

    # 找最新备份
    $backupDir = Join-Path $scriptDir "backups"
    if (-not (Test-Path $backupDir)) { throw "没有找到备份目录: $backupDir" }
    $latest = Get-ChildItem -Path $backupDir -Filter "backup_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw "没有找到备份文件" }
    Write-OK "使用备份: $($latest.Name)"
    $backup = Get-Content $latest.FullName -Raw | ConvertFrom-Json
    Write-Host "  WAN MAC : $($backup.wan_mac)"
    Write-Host "  LAN MAC : $($backup.lan_mac)"
    Write-Host "  LAN IP  : $($backup.lan_ip)"
    Write-Host "  主机名  : $($backup.hostname)"

    $confirm = Read-Host "确认回滚到以上配置？(Y/N)"
    if ($confirm -notmatch '^[Yy]') { Write-Host "已取消。"; exit 0 }

    # 改电脑 MAC 为白名单
    $adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceType -eq 6 } | Select-Object -First 1
    if (-not $adapter) { throw "未找到以太网适配器" }
    Write-Step "改电脑 MAC 为白名单..."
    $regPath = Get-NicRegistryPath -NetCfgInstanceId $adapter.DeviceID
    Set-PcMac -Mac $WhitelistMac -AdapterName $adapter.Name

    # 找路由器 IP
    $routerIP = Get-RouterIP
    if (-not $routerIP) { throw "找不到路由器 IP" }

    # 拿账密 + 登录
    Enable-TelnetClient
    $cred = Get-TelnetCredentials -RouterIP $routerIP -AdminPass $WebPass
    if (-not $cred) { throw "获取 Telnet 账密失败" }
    $session = New-TelnetSession -Host $routerIP -User $cred.User -Pass $cred.Pass
    Connect-Telnet $session

    # 恢复
    Restore-RouterConfig -Session $session -Backup $backup
    Save-RouterIP -IP $backup.lan_ip
    Write-Log "Rollback to $($latest.Name)"

} catch {
    Write-Err "出错: $_"
    Write-Log "Rollback error: $_" "ERROR"
} finally {
    if ($regPath -and $adapter) {
        Write-Step "恢复电脑 MAC..."
        Remove-ItemProperty -Path $regPath -Name "NetworkAddress" -ErrorAction SilentlyContinue
        Restart-NetAdapter -Name $adapter.Name -Confirm:$false
        Start-Sleep -Seconds 3
    }
    if ($session) { Close-TelnetSession $session }
}

Write-Host "`n=============================================" -ForegroundColor Magenta
Write-Host " 回滚命令已发送，路由器重启中..." -ForegroundColor Green
Write-Host "=============================================`n" -ForegroundColor Magenta
Read-Host '按回车退出'

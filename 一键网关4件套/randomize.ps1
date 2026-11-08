# ============================================================
# 一键随机化脚本 —— 改 WAN MAC / LAN MAC / 主机名（可选 LAN IP）
# 安全机制：改前备份 → 改后验证 → 失败自动回滚 → PC MAC 强制恢复
# 用法：右键 randomize.bat 以管理员身份运行
# ============================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 加载配置和核心模块
. (Join-Path $scriptDir "config.ps1")
. (Join-Path $scriptDir "router_core.ps1")

$adapter = $null
$originalMac = $null
$regPath = $null
$session = $null
$backup = $null
$changed = $false

try {
    Write-Host "`n=============================================" -ForegroundColor Magenta
    Write-Host " 中兴 E2633 一键随机化（安全版）" -ForegroundColor Magenta
    Write-Host "=============================================" -ForegroundColor Magenta

    # 0. 获取以太网适配器
    Write-Step "获取以太网适配器..."
    $adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceType -eq 6 } | Select-Object -First 1
    if (-not $adapter) { throw "未找到活动的以太网适配器" }
    Write-OK "适配器: $($adapter.Name)"
    $originalMac = $adapter.MacAddress.Replace("-", "")
    Write-Host "  原始 MAC: $originalMac"

    # 1. 改电脑 MAC 为白名单（中兴工厂模式需要）
    Write-Step "改电脑 MAC 为白名单 $WhitelistMac..."
    $regPath = Get-NicRegistryPath -NetCfgInstanceId $adapter.DeviceID
    Set-PcMac -Mac $WhitelistMac -AdapterName $adapter.Name
    Write-OK "白名单 MAC 已设置"

    # 2. 自动找路由器 IP
    $routerIP = Get-RouterIP
    if (-not $routerIP) { throw "找不到路由器 IP" }

    # 3. 启用 Telnet 客户端
    Enable-TelnetClient

    # 4. 获取 Telnet 账密
    $cred = Get-TelnetCredentials -RouterIP $routerIP -AdminPass $WebPass
    if (-not $cred) { throw "获取 Telnet 账密失败" }

    # 5. 登录 Telnet
    $session = New-TelnetSession -Host $routerIP -User $cred.User -Pass $cred.Pass
    Connect-Telnet $session

    # 6. 备份当前配置
    $backup = Backup-RouterConfig -Session $session

    # 7. 生成随机值
    $newWanMac = Get-RandomMac
    $newLanMac = Get-RandomMac
    while ($newWanMac -eq $newLanMac) { $newLanMac = Get-RandomMac }
    $newHostname = Get-RandomHostname
    $newLanIp = $null
    if ($ChangeLanIp) { $newLanIp = Get-RandomLanIp }

    Write-Host ""
    Write-Step "即将应用的新值："
    Write-Host "  WAN MAC  : $newWanMac"
    Write-Host "  LAN MAC  : $newLanMac"
    Write-Host "  主机名   : $newHostname"
    if ($newLanIp) {
        Write-Host "  LAN IP   : $newLanIp" -ForegroundColor Yellow
        Write-Warn "LAN IP 将被修改！电脑会掉线，脚本会自动切到新网段。"
    } else {
        Write-Host "  LAN IP   : 不改（保持 $($backup.lan_ip)）" -ForegroundColor Green
    }

    # 8. 执行修改
    Write-Step "应用修改..."
    Invoke-TelnetCmd $session "sendcmd 1 DB set MAC 0 MACAddr $newWanMac" 5000 | Out-Null
    Invoke-TelnetCmd $session "sendcmd 1 DB set MAC 1 MACAddr $newLanMac" 5000 | Out-Null
    Invoke-TelnetCmd $session "sendcmd 1 DB set HostNameList 0 HostName $newHostname" 5000 | Out-Null
    if ($newLanIp) {
        Invoke-TelnetCmd $session "sendcmd 1 DB set IPv4Address 0 IPAddress $newLanIp" 5000 | Out-Null
        Invoke-TelnetCmd $session "sendcmd 1 DB set IPv4Address 0 SubnetMask $SubnetMask" 5000 | Out-Null
    }
    Invoke-TelnetCmd $session 'sendcmd 1 DB save' 5000 | Out-Null
    Write-OK "配置已保存"
    $changed = $true

    # 9. 重启路由器
    Write-Step "重启路由器..."
    Invoke-TelnetCmd $session 'reboot' 5000 | Out-Null
    Close-TelnetSession $session
    $session = $null
    Write-Host "  等待 $RebootWaitSec 秒让路由器重启..."
    Start-Sleep -Seconds $RebootWaitSec

    # 10. 如果改了 LAN IP，把电脑切到新网段
    if ($newLanIp) {
        Set-PcIpToSegment -RouterIp $newLanIp -AdapterName $adapter.Name
        $targetIP = $newLanIp
    } else {
        $targetIP = $routerIP
    }

    # 11. 验证连通性
    $reachable = Test-RouterReachable -IP $targetIP -TimeoutSec $ConnectTimeoutSec

    if ($reachable) {
        Write-OK "修改成功！路由器可达: $targetIP"
        if ($newLanIp) { Save-RouterIP -IP $newLanIp }
        Write-Log "Randomize SUCCESS: wan=$newWanMac lan=$newLanMac host=$newHostname ip=$targetIP"
    } else {
        # 12. 失败自动回滚
        Write-Warn "路由器不可达，正在自动回滚..."
        if ($newLanIp) { Reset-PcIpToDhcp -AdapterName $adapter.Name }
        Start-Sleep -Seconds 3
        # 用原 IP 重新连接回滚
        $rollbackIP = $routerIP
        if (-not (Test-Connection $rollbackIP -Count 1 -Quiet -TimeoutSeconds 3)) {
            # 原 IP 也不通，尝试新 IP
            if ($newLanIp -and (Test-Connection $newLanIp -Count 1 -Quiet -TimeoutSeconds 3)) { $rollbackIP = $newLanIp }
        }
        try {
            $rbCred = Get-TelnetCredentials -RouterIP $rollbackIP -AdminPass $WebPass
            $rbSession = New-TelnetSession -Host $rollbackIP -User $rbCred.User -Pass $rbCred.Pass
            Connect-Telnet $rbSession
            Restore-RouterConfig -Session $rbSession -Backup $backup
            Close-TelnetSession $rbSession
            Write-Warn "已发送回滚命令，请等待路由器重启后手动确认。"
            Write-Log "Randomize FAILED, rollback sent" "WARN"
        } catch {
            Write-Err "自动回滚失败！请手动恢复出厂设置。"
            Write-Log "Rollback failed" "ERROR"
        }
    }

} catch {
    Write-Err "出错: $_"
    Write-Log "Error: $_" "ERROR"
} finally {
    # 无论成功失败，强制恢复电脑 MAC
    if ($regPath -and $adapter) {
        Write-Step "恢复电脑 MAC..."
        try {
            Remove-ItemProperty -Path $regPath -Name "NetworkAddress" -ErrorAction SilentlyContinue
            Restart-NetAdapter -Name $adapter.Name -Confirm:$false
            Start-Sleep -Seconds 3
            Write-OK "电脑 MAC 已恢复"
        } catch {
            Write-Warn "电脑 MAC 恢复失败，请手动检查网卡属性。"
        }
    }
    if ($session) { Close-TelnetSession $session }
    if ($changed -and (Test-Path Variable:\reachable) -and $reachable) {
        Reset-PcIpToDhcp -AdapterName $adapter.Name
    }
}

Write-Host "`n=============================================" -ForegroundColor Magenta
if ($changed -and $reachable) {
    Write-Host " 完成！新后台地址: http://$targetIP" -ForegroundColor Green
} else {
    Write-Host " 未完成或已回滚，请检查日志。" -ForegroundColor Yellow
}
Write-Host " 日志: $scriptDir\logs\operations.log" -ForegroundColor Cyan
Write-Host "=============================================`n" -ForegroundColor Magenta

Read-Host '按回车退出'

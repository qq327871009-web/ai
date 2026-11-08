# ============================================================
# 探测脚本 —— 查看 WLAN / IPv6 / DHCP 等表，确认能否改 WiFi/IPv6
# 只读，不会改配置
# 用法：右键 probe.bat 以管理员身份运行
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
    Write-Host " sendcmd 表结构探测（只读）" -ForegroundColor Magenta
    Write-Host "=============================================" -ForegroundColor Magenta

    $adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceType -eq 6 } | Select-Object -First 1
    if (-not $adapter) { throw "未找到以太网适配器" }
    Write-Step "改电脑 MAC 为白名单..."
    $regPath = Get-NicRegistryPath -NetCfgInstanceId $adapter.DeviceID
    Set-PcMac -Mac $WhitelistMac -AdapterName $adapter.Name

    $routerIP = Get-RouterIP
    if (-not $routerIP) { throw "找不到路由器 IP" }

    Enable-TelnetClient
    $cred = Get-TelnetCredentials -RouterIP $routerIP -AdminPass $WebPass
    if (-not $cred) { throw "获取 Telnet 账密失败" }

    $session = New-TelnetSession -Host $routerIP -User $cred.User -Pass $cred.Pass
    Connect-Telnet $session

    Write-Step "列出所有表..."
    $all = Invoke-TelnetCmd $session 'sendcmd 1 DB all' 20000

    $tables = @('WLAN', 'WLANBase', 'WLANCfg', 'SSID', 'WlVirtIF', 'DHCP', 'DHCPS', 'IPv6', 'IPv6Cfg', 'MgtServer', 'UserInfo', 'TelnetCfg', 'WANC', 'LAN', 'WAN', 'IPv4Address', 'MAC', 'HostNameList')
    $results = @{ 'DB all' = $all }
    foreach ($t in $tables) {
        Write-Host ">>> sendcmd 1 DB p $t" -ForegroundColor DarkGray
        $results[$t] = Invoke-TelnetCmd $session "sendcmd 1 DB p $t" 10000
    }

    $outFile = Join-Path $scriptDir "probe_result.txt"
    $sb = New-Object System.Text.StringBuilder
    foreach ($k in $results.Keys) {
        [void]$sb.AppendLine("===== $k =====")
        [void]$sb.AppendLine($results[$k])
        [void]$sb.AppendLine()
    }
    $sb.ToString() | Out-File $outFile -Encoding UTF8

    Write-Host "`n=============================================" -ForegroundColor Magenta
    Write-OK "探测完成！结果: $outFile"
    Write-Host " 把 probe_result.txt 内容发给我。" -ForegroundColor Cyan
    Write-Host "=============================================`n" -ForegroundColor Magenta

} catch {
    Write-Err "出错: $_"
} finally {
    if ($regPath -and $adapter) {
        Remove-ItemProperty -Path $regPath -Name "NetworkAddress" -ErrorAction SilentlyContinue
        Restart-NetAdapter -Name $adapter.Name -Confirm:$false
        Start-Sleep -Seconds 3
    }
    if ($session) { Close-TelnetSession $session }
}

Read-Host '按回车退出'

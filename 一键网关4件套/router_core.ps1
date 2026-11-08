# ============================================================
# 核心模块 —— IP探测、Telnet、sendcmd、备份、回滚
# 被 randomize.ps1 / rollback.ps1 / probe.ps1 引用
# ============================================================

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---------- 日志 ----------
function Write-Step($msg) { Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[x] $msg" -ForegroundColor Red }

function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $logDir = Join-Path $scriptDir "logs"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    $logFile = Join-Path $logDir "operations.log"
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Level] $Msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

# ---------- 自动找路由器 IP ----------
function Get-RouterIP {
    Write-Step "正在自动获取路由器 IP..."
    # 1. 从以太网网关取
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceType -eq 6 }
    foreach ($a in $adapters) {
        $cfg = Get-NetIPConfiguration -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue
        $gw = $cfg.IPv4DefaultGateway.NextHop
        if ($gw) { Write-OK "路由器 IP = $gw （$($a.Name) 网关）"; return $gw }
    }
    # 2. 读上次保存的 IP
    $ipFile = Join-Path $scriptDir "router_ip.txt"
    if (Test-Path $ipFile) {
        $saved = (Get-Content $ipFile -Raw).Trim()
        if ($saved -and (Test-Connection $saved -Count 1 -Quiet -TimeoutSeconds 2)) {
            Write-OK "路由器 IP = $saved （上次保存）"; return $saved
        }
    }
    # 3. 扫描常见网段
    Write-Warn "扫描常见网段..."
    foreach ($ip in @('192.168.1.1','192.168.0.1','192.168.5.1','192.168.2.1','192.168.3.1','192.168.4.1','192.168.8.1','10.0.0.1')) {
        if (Test-Connection $ip -Count 1 -Quiet -TimeoutSeconds 1) { Write-OK "路由器 IP = $ip （扫描命中）"; return $ip }
    }
    Write-Err "找不到路由器 IP，请确认电脑已用网线连路由器。"
    Write-Log "Get-RouterIP failed" "ERROR"
    return $null
}

function Save-RouterIP {
    param([string]$IP)
    $ipFile = Join-Path $scriptDir "router_ip.txt"
    $IP | Set-Content $ipFile -Encoding UTF8
    Write-OK "已保存路由器 IP 到 router_ip.txt"
}

# ---------- 启用 Windows Telnet 客户端 ----------
function Enable-TelnetClient {
    Write-Step "检查 Windows Telnet 客户端..."
    $f = Get-WindowsOptionalFeature -Online -FeatureName TelnetClient -ErrorAction SilentlyContinue
    if ($f.State -ne 'Enabled') {
        Write-Warn "正在启用 Telnet 客户端..."
        dism /online /Enable-Feature /FeatureName:TelnetClient /NoRestart | Out-Null
        Write-OK "Telnet 客户端已启用"
    } else { Write-OK "Telnet 客户端已启用" }
}

# ---------- 查找 zteOnu.exe ----------
function Find-ZteOnu {
    # 1. config.ps1 里指定的路径
    if ($ZteOnuPath -and (Test-Path $ZteOnuPath)) { return $ZteOnuPath }
    # 2. 脚本同目录
    $p = Join-Path $scriptDir "zteOnu.exe"
    if (Test-Path $p) { return $p }
    # 3. 子目录里找
    $found = Get-ChildItem -Path $scriptDir -Recurse -Filter "zteOnu.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
    # 4. 旧路径
    $old = "C:\Users\Administrator\Desktop\中兴路由器开telnet\zteOnu_0.0.7_windows_amd64\zteOnu.exe"
    if (Test-Path $old) { return $old }
    return $null
}

# ---------- 运行 zteOnu 获取 Telnet 账密 ----------
function Get-TelnetCredentials {
    param([string]$RouterIP, [string]$AdminPass)
    Write-Step "运行 zteOnu 获取 Telnet 账密..."
    $exe = Find-ZteOnu
    if (-not $exe) {
        Write-Err "找不到 zteOnu.exe，请放到脚本同目录或在 config.ps1 指定路径。"
        return $null
    }
    Write-Host "  使用: $exe"
    $outFile = Join-Path $env:TEMP "zteonu_out.txt"
    $errFile = Join-Path $env:TEMP "zteonu_err.txt"
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue
    Start-Process -FilePath $exe -ArgumentList "-i", $RouterIP, "-p", $AdminPass, "--port", "80", "-u", "admin" -NoNewWindow -Wait -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $output = ""
    if (Test-Path $outFile) { $output += Get-Content $outFile -Raw }
    if (Test-Path $errFile) { $output += Get-Content $errFile -Raw }
    Write-Host $output

    $user = $null; $pass = $null
    if ($output -match '(?i)(?:Telnet\s*User|User|username)[:\s=]+(\S+)') { $user = $Matches[1] }
    if ($output -match '(?i)(?:Telnet\s*Pass|Pass|password)[:\s=]+(\S+)') { $pass = $Matches[1] }
    if ($user -and $pass) {
        Write-OK "Telnet 账号 = $user"
        Write-OK "Telnet 密码 = $pass"
        Write-Log "Got Telnet creds for $RouterIP"
        return @{ User = $user; Pass = $pass }
    }
    Write-Err "未能解析出 Telnet 账密，请检查上面的 zteOnu 输出。"
    Write-Log "Get-TelnetCredentials failed" "ERROR"
    return $null
}

# ---------- Telnet 会话 ----------
function New-TelnetSession {
    param([string]$Host, [int]$Port = 23, [string]$User, [string]$Pass)
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect($Host, $Port)
    $stream = $client.GetStream()
    return @{ Client = $client; Stream = $stream; User = $User; Pass = $Pass }
}

function Read-TelnetText {
    param($Session, [string]$Until = $null, [int]$TimeoutMs = 10000)
    $stream = $Session.Stream
    $buf = New-Object System.Text.StringBuilder
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
        if ($stream.DataAvailable) {
            $b = $stream.ReadByte()
            if ($b -eq 0xFF) {
                $cmd = $stream.ReadByte()
                if ($cmd -eq 0xFA) {
                    while (($c = $stream.ReadByte()) -ne -1) { if ($c -eq 0xFF) { if ($stream.ReadByte() -eq 0xF0) { break } } }
                } elseif ($cmd -ge 0xFB -and $cmd -le 0xFE) {
                    $opt = $stream.ReadByte()
                    $resp = if ($cmd -eq 0xFD) { 0xFC } else { 0xFE }
                    $stream.WriteByte(0xFF); $stream.WriteByte($resp); $stream.WriteByte($opt); $stream.Flush()
                } else { $null = $stream.ReadByte() }
            } else {
                [void]$buf.Append([char]$b)
                if ($Until -and $buf.ToString() -match $Until) { return $buf.ToString() }
            }
        } else { Start-Sleep -Milliseconds 50 }
    }
    return $buf.ToString()
}

function Send-TelnetLine { param($Session, [string]$Text); $bytes = [System.Text.Encoding]::ASCII.GetBytes($Text + "`r`n"); $Session.Stream.Write($bytes, 0, $bytes.Length); $Session.Stream.Flush() }

function Connect-Telnet {
    param($Session)
    Write-Step "连接 Telnet..."
    $null = Read-TelnetText $Session 'ogin:|username:|账号|user' 10000
    Send-TelnetLine $Session $Session.User
    $null = Read-TelnetText $Session 'assword:|密码|pass' 10000
    Send-TelnetLine $Session $Session.Pass
    $null = Read-TelnetText $Session '[>#$] ' 12000
    Write-OK "Telnet 登录成功"
}

function Invoke-TelnetCmd {
    param($Session, [string]$Command, [int]$Timeout = 10000)
    Send-TelnetLine $Session $Command
    return Read-TelnetText $Session '[>#$] ' $Timeout
}

function Close-TelnetSession { param($Session); try { $Session.Client.Close() } catch {} }

# ---------- 电脑 MAC 管理 ----------
function Get-NicRegistryPath {
    param([string]$NetCfgInstanceId)
    $classRoot = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
    foreach ($key in (Get-ChildItem -Path $classRoot -ErrorAction SilentlyContinue)) {
        try {
            $id = (Get-ItemProperty -Path $key.PSPath -Name "NetCfgInstanceId" -ErrorAction Stop).NetCfgInstanceId
            if ($id -eq $NetCfgInstanceId) { return $key.PSPath }
        } catch { continue }
    }
    throw "找不到网卡注册表项: $NetCfgInstanceId"
}

function Set-PcMac {
    param([string]$Mac, [string]$AdapterName)
    $adapter = Get-NetAdapter -Name $AdapterName -ErrorAction Stop
    $regPath = Get-NicRegistryPath -NetCfgInstanceId $adapter.DeviceID
    if ($Mac) {
        Set-ItemProperty -Path $regPath -Name "NetworkAddress" -Value $Mac
    } else {
        Remove-ItemProperty -Path $regPath -Name "NetworkAddress" -ErrorAction SilentlyContinue
    }
    Restart-NetAdapter -Name $AdapterName -Confirm:$false
    Start-Sleep -Seconds 3
}

# ---------- 随机值生成 ----------
function Get-RandomMac {
    $firstByte = 0x02 + (Get-Random -Maximum 4) * 4
    $bytes = @($firstByte) + (1..5 | ForEach-Object { Get-Random -Maximum 256 })
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ":"
}

function Get-RandomHostname {
    $chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    $first = "abcdefghijklmnopqrstuvwxyz"[(Get-Random -Maximum 26)]
    $rest = -join (1..7 | ForEach-Object { $chars[(Get-Random -Maximum 36)] })
    return $first + $rest
}

function Get-RandomLanIp {
    $seg = $LanIpSegments[(Get-Random -Maximum $LanIpSegments.Count)]
    $fourth = Get-Random -Minimum $seg.FourthMin -Maximum ($seg.FourthMax + 1)
    return "192.168.$($seg.ThirdOctet).$fourth"
}

# ---------- 备份 ----------
function Backup-RouterConfig {
    param($Session)
    Write-Step "备份当前配置..."
    $macOut  = Invoke-TelnetCmd $Session 'sendcmd 1 DB p MAC' 10000
    $ipOut   = Invoke-TelnetCmd $Session 'sendcmd 1 DB p IPv4Address' 10000
    $hostOut = Invoke-TelnetCmd $Session 'sendcmd 1 DB p HostNameList' 10000

    $wanMac = ""; $lanMac = ""; $lanIp = ""; $subnet = ""; $hostname = ""
    $macs = [regex]::Matches($macOut, 'MACAddr["\s=]+val=["'']?([0-9a-fA-F:]+)')
    if ($macs.Count -ge 1) { $wanMac = $macs[0].Groups[1].Value }
    if ($macs.Count -ge 2) { $lanMac = $macs[1].Groups[1].Value }
    if ($ipOut -match 'IPAddress["\s=]+val=["'']?([\d.]+)') { $lanIp = $Matches[1] }
    if ($ipOut -match 'SubnetMask["\s=]+val=["'']?([\d.]+)') { $subnet = $Matches[1] }
    if ($hostOut -match 'HostName["\s=]+val=["'']?(\S+)') { $hostname = $Matches[1] }

    Write-Host "  WAN MAC : $wanMac"
    Write-Host "  LAN MAC : $lanMac"
    Write-Host "  LAN IP  : $lanIp"
    Write-Host "  子网掩码: $subnet"
    Write-Host "  主机名  : $hostname"

    $backup = @{
        timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        wan_mac   = $wanMac
        lan_mac   = $lanMac
        lan_ip    = $lanIp
        subnet    = $subnet
        hostname  = $hostname
        raw_mac   = $macOut
        raw_ip    = $ipOut
        raw_host  = $hostOut
    }
    $backupDir = Join-Path $scriptDir "backups"
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = Join-Path $backupDir "backup_$ts.json"
    $backup | ConvertTo-Json -Depth 5 | Set-Content $backupFile -Encoding UTF8
    Write-OK "备份已保存: $backupFile"
    Write-Log "Backup saved: $backupFile"
    return $backup
}

# ---------- 恢复（回滚） ----------
function Restore-RouterConfig {
    param($Session, [hashtable]$Backup)
    Write-Step "正在恢复配置..."
    if ($Backup.wan_mac)  { Invoke-TelnetCmd $Session "sendcmd 1 DB set MAC 0 MACAddr $($Backup.wan_mac)" 5000 | Out-Null }
    if ($Backup.lan_mac)  { Invoke-TelnetCmd $Session "sendcmd 1 DB set MAC 1 MACAddr $($Backup.lan_mac)" 5000 | Out-Null }
    if ($Backup.lan_ip)   { Invoke-TelnetCmd $Session "sendcmd 1 DB set IPv4Address 0 IPAddress $($Backup.lan_ip)" 5000 | Out-Null }
    if ($Backup.subnet)   { Invoke-TelnetCmd $Session "sendcmd 1 DB set IPv4Address 0 SubnetMask $($Backup.subnet)" 5000 | Out-Null }
    if ($Backup.hostname) { Invoke-TelnetCmd $Session "sendcmd 1 DB set HostNameList 0 HostName $($Backup.hostname)" 5000 | Out-Null }
    Invoke-TelnetCmd $Session 'sendcmd 1 DB save' 5000 | Out-Null
    Invoke-TelnetCmd $Session 'reboot' 5000 | Out-Null
    Write-OK "恢复命令已发送，路由器重启中..."
    Write-Log "Config restored from backup"
}

# ---------- 连通性验证 ----------
function Test-RouterReachable {
    param([string]$IP, [int]$TimeoutSec = 60)
    Write-Step "验证路由器可达性 ($IP)..."
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt ($TimeoutSec * 1000)) {
        if (Test-Connection $IP -Count 1 -Quiet -TimeoutSeconds 2) {
            Write-OK "路由器可达: $IP"
            return $true
        }
        Start-Sleep -Seconds 2
    }
    Write-Warn "路由器在 ${TimeoutSec}s 内不可达: $IP"
    return $false
}

# ---------- 把电脑切到指定网段 ----------
function Set-PcIpToSegment {
    param([string]$RouterIp, [string]$AdapterName)
    $parts = $RouterIp.Split('.')
    $pcIp = "$($parts[0]).$($parts[1]).$($parts[2]).100"
    Write-Step "把电脑 IP 设为 $pcIp 以适配新网段..."
    try {
        netsh interface ip set address name="$AdapterName" static $pcIp 255.255.255.0 $RouterIp 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        Write-OK "电脑 IP 已设为 $pcIp"
    } catch {
        Write-Warn "设置静态 IP 失败，请手动设置电脑 IP 为 $pcIp"
    }
}

function Reset-PcIpToDhcp {
    param([string]$AdapterName)
    Write-Step "恢复电脑为自动获取 IP..."
    netsh interface ip set address name="$AdapterName" source=dhcp 2>&1 | Out-Null
    netsh interface ip set dns name="$AdapterName" source=dhcp 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-OK "电脑 IP 已恢复 DHCP"
}

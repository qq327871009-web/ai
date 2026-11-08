# ============================================================
# 中兴 E2633 路由器一键探测脚本
# 功能：自动找IP → 开Telnet → zteonu拿账密 → 自动登录 → 探测sendcmd表
# 用法：右键 probe_router.bat 以管理员身份运行
# ============================================================

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# ---------- 配置区（按需修改） ----------
$ZteOnuPath = "$scriptDir\zteOnu.exe"
# 如果不在脚本同目录，取消下面这行注释并改成你的实际路径
# $ZteOnuPath = 'C:\Users\Administrator\Desktop\中兴路由器开telnet\zteOnu_0.0.7_windows_amd64\zteOnu.exe'
$WebUser     = 'user'
$WebPass     = 'qq327871009'
# ----------------------------------------

function Write-Step($msg) { Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[x] $msg" -ForegroundColor Red }

# ============================================================
# 1. 自动获取路由器 IP（电脑默认网关）
# ============================================================
function Get-RouterIP {
    Write-Step '正在自动获取路由器 IP...'
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceType -eq 6 }
    foreach ($a in $adapters) {
        $cfg = Get-NetIPConfiguration -InterfaceIndex $a.ifIndex -ErrorAction SilentlyContinue
        $gw  = $cfg.IPv4DefaultGateway.NextHop
        if ($gw) { Write-OK "路由器 IP = $gw （来自 $($a.Name) 网关）"; return $gw }
    }
    Write-Warn '未从网关获取到，扫描常见网段...'
    foreach ($ip in @('192.168.1.1','192.168.0.1','192.168.5.1','192.168.2.1','192.168.3.1','10.0.0.1','192.168.10.1')) {
        if (Test-Connection $ip -Count 1 -Quiet -TimeoutSeconds 1) { Write-OK "路由器 IP = $ip （扫描命中）"; return $ip }
    }
    Write-Err '无法自动获取路由器 IP，请确认电脑已用网线连接路由器。'
    return $null
}

# ============================================================
# 2. 启用 Windows Telnet 客户端
# ============================================================
function Enable-TelnetClient {
    Write-Step '检查 Windows Telnet 客户端...'
    $f = Get-WindowsOptionalFeature -Online -FeatureName TelnetClient -ErrorAction SilentlyContinue
    if ($f.State -ne 'Enabled') {
        Write-Warn 'Telnet 客户端未启用，正在启用（需管理员）...'
        dism /online /Enable-Feature /FeatureName:TelnetClient /NoRestart | Out-Null
        Write-OK 'Telnet 客户端已启用'
    } else { Write-OK 'Telnet 客户端已启用' }
}

# ============================================================
# 3. 运行 zteOnu 获取 Telnet 账密并自动解析
# ============================================================
function Get-TelnetCredentials($routerIP) {
    Write-Step "运行 zteOnu 获取 Telnet 账密..."
    if (-not (Test-Path $ZteOnuPath)) {
        Write-Err "未找到 zteOnu.exe：$ZteOnuPath"
        Write-Host "   请把 zteOnu.exe 放到脚本同目录，或修改脚本里的 `$ZteOnuPath" -ForegroundColor Yellow
        return $null
    }
    $output = & $ZteOnuPath --ip $routerIP --new --user $WebUser --pass $WebPass --port 80 --tp 23 --telnet 2>&1
    $text = $output | Out-String
    Write-Host $text

    $user = $null; $pass = $null
    if ($text -match '(?i)(?:user(?:name)?|账号|用户名)\s*[:=]\s*([A-Za-z0-9_]+)') { $user = $Matches[1] }
    if ($text -match '(?i)(?:pass(?:word)?|密码|pwd)\s*[:=]\s*([A-Za-z0-9!@#$%^&*._-]+)') { $pass = $Matches[1] }
    # 兜底
    if (-not $user -and $text -match '(?i)username[:\s=]+([A-Za-z0-9_]+)') { $user = $Matches[1] }
    if (-not $pass -and $text -match '(?i)password[:\s=]+([A-Za-z0-9!@#$%^&*._-]+)') { $pass = $Matches[1] }

    if ($user -and $pass) {
        Write-OK "Telnet 账号 = $user"
        Write-OK "Telnet 密码 = $pass"
        return @{ User = $user; Pass = $pass }
    }
    Write-Err '未能从 zteOnu 输出中解析出账密，请把上面输出贴给我。'
    return $null
}

# ============================================================
# 4. Telnet 会话（PowerShell 原生实现，处理 IAC）
# ============================================================
function New-TelnetSession {
    param([string]$Host, [int]$Port = 23, [string]$User, [string]$Pass)
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect($Host, $Port)
    $stream = $client.GetStream()
    return @{
        Client = $client
        Stream = $stream
        User   = $User
        Pass   = $Pass
    }
}

# 从 Telnet 流读取，处理 IAC 协商，返回文本
function Read-TelnetText {
    param($Session, [string]$Until = $null, [int]$TimeoutMs = 10000)
    $stream = $Session.Stream
    $buf = New-Object System.Text.StringBuilder
    $sw  = [System.Diagnostics.Stopwatch]::StartNew()
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
                } else {
                    $null = $stream.ReadByte()
                }
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
    Write-Step "连接 Telnet $($Session.Client.Client.RemoteEndPoint.Address)..."
    # 等登录提示符
    $null = Read-TelnetText $Session 'ogin:|username:|账号|user' 10000
    Send-TelnetLine $Session $Session.User
    $null = Read-TelnetText $Session 'assword:|密码|pass' 10000
    Send-TelnetLine $Session $Session.Pass
    $banner = Read-TelnetText $Session '[>#$] ' 12000
    Write-OK 'Telnet 登录成功'
    return $banner
}

function Invoke-TelnetCmd {
    param($Session, [string]$Command, [int]$Timeout = 10000)
    Send-TelnetLine $Session $Command
    return Read-TelnetText $Session '[>#$] ' $Timeout
}

function Close-TelnetSession { param($Session); try { $Session.Client.Close() } catch {} }

# ============================================================
# 主流程
# ============================================================
Write-Host "`n=============================================" -ForegroundColor Magenta
Write-Host " 中兴 E2633 一键探测脚本" -ForegroundColor Magenta
Write-Host "=============================================" -ForegroundColor Magenta

Enable-TelnetClient

$routerIP = Get-RouterIP
if (-not $routerIP) { Read-Host '按回车退出'; exit 1 }

$cred = Get-TelnetCredentials $routerIP
if (-not $cred) { Read-Host '按回车退出'; exit 1 }

try {
    $session = New-TelnetSession -Host $routerIP -User $cred.User -Pass $cred.Pass
    $null = Connect-Telnet $session
} catch {
    Write-Err "Telnet 登录失败：$_"
    Read-Host '按回车退出'; exit 1
}

Write-Step '执行 sendcmd 探测（只读，不会改配置）...'
Write-Host ">>> sendcmd 1 DB all" -ForegroundColor DarkGray
$out1 = Invoke-TelnetCmd $session 'sendcmd 1 DB all' 15000
Write-Host ">>> sendcmd 1 DB p all" -ForegroundColor DarkGray
$out2 = Invoke-TelnetCmd $session 'sendcmd 1 DB p all' 15000

# 顺便探测关键表
Write-Host ">>> sendcmd 1 DB p WAN" -ForegroundColor DarkGray
$out3 = Invoke-TelnetCmd $session 'sendcmd 1 DB p WAN' 10000
Write-Host ">>> sendcmd 1 DB p LAN" -ForegroundColor DarkGray
$out4 = Invoke-TelnetCmd $session 'sendcmd 1 DB p LAN' 10000
Write-Host ">>> sendcmd 1 DB p WLAN" -ForegroundColor DarkGray
$out5 = Invoke-TelnetCmd $session 'sendcmd 1 DB p WLAN' 10000
Write-Host ">>> sendcmd 1 DB p DHCP" -ForegroundColor DarkGray
$out6 = Invoke-TelnetCmd $session 'sendcmd 1 DB p DHCP' 10000
Write-Host ">>> sendcmd 1 DB p IPv6" -ForegroundColor DarkGray
$out7 = Invoke-TelnetCmd $session 'sendcmd 1 DB p IPv6' 10000

Close-TelnetSession $session

$outFile = "$scriptDir\probe_result.txt"
@(
    "===== sendcmd 1 DB all =====", $out1,
    "`n===== sendcmd 1 DB p all =====", $out2,
    "`n===== sendcmd 1 DB p WAN =====", $out3,
    "`n===== sendcmd 1 DB p LAN =====", $out4,
    "`n===== sendcmd 1 DB p WLAN =====", $out5,
    "`n===== sendcmd 1 DB p DHCP =====", $out6,
    "`n===== sendcmd 1 DB p IPv6 =====", $out7
) | Out-File $outFile -Encoding UTF8

Write-Host "`n=============================================" -ForegroundColor Magenta
Write-OK "探测完成！结果已保存到："
Write-Host "   $outFile" -ForegroundColor Yellow
Write-Host "`n请把 probe_result.txt 的内容贴给我。" -ForegroundColor Cyan
Write-Host "=============================================`n" -ForegroundColor Magenta

Read-Host '按回车退出'

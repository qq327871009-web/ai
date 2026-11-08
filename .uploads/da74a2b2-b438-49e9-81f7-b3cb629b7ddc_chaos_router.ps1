# -*- coding: utf-8 -*-
param(
    [string]$RouterIP = "192.168.5.1",
    [string]$AdminPass = "qq327871009",
    [string]$WhitelistMac = "000729553557",
    [string]$ZteOnuDir = "C:\Users\Administrator\Desktop\中兴路由器开telnet\zteOnu_0.0.7_windows_amd64"
)

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $PSScriptRoot "router_change_log.json"

function Get-RandomMac {
    $firstByte = 0x02 + (Get-Random -Maximum 4) * 4
    $bytes = @($firstByte) + (1..5 | ForEach-Object { Get-Random -Maximum 256 })
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ":"
}

function Get-RandomLanIp {
    $seg = Get-Random -Maximum 3
    if ($seg -eq 0) {
        return "192.168." + ((Get-Random -Maximum 254) + 1) + "." + ((Get-Random -Maximum 254) + 1)
    } elseif ($seg -eq 1) {
        return "10." + (Get-Random -Maximum 256) + "." + (Get-Random -Maximum 256) + "." + ((Get-Random -Maximum 254) + 1)
    } else {
        return "172." + (Get-Random -Minimum 16 -Maximum 32) + "." + (Get-Random -Maximum 256) + "." + ((Get-Random -Maximum 254) + 1)
    }
}

function Get-RandomHostname {
    $chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    $first = "abcdefghijklmnopqrstuvwxyz"[(Get-Random -Maximum 26)]
    $rest = -join (1..7 | ForEach-Object { $chars[(Get-Random -Maximum 36)] })
    return $first + $rest
}

function Send-TelnetCommands {
    param(
        [string]$RemoteHost,
        [string]$User,
        [string]$Pass,
        [string[]]$Commands
    )
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect($RemoteHost, 23)
    $stream = $tcp.GetStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $writer = New-Object System.IO.StreamWriter($stream)
    $writer.AutoFlush = $true
    Start-Sleep -Milliseconds 500
    while ($stream.DataAvailable) { $reader.Read() | Out-Null }
    $writer.WriteLine($User)
    Start-Sleep -Milliseconds 500
    while ($stream.DataAvailable) { $reader.Read() | Out-Null }
    $writer.WriteLine($Pass)
    Start-Sleep -Milliseconds 1000
    $results = @()
    foreach ($cmd in $Commands) {
        $writer.WriteLine($cmd)
        Start-Sleep -Milliseconds 800
        $out = ""
        while ($stream.DataAvailable) { $out += [char]$reader.Read() }
        $results += $out
    }
    $tcp.Close()
    return $results
}

function Get-NicRegistryPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NetCfgInstanceId
    )
    $classRoot = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
    if (-not (Test-Path $classRoot)) {
        throw "Network adapter class registry key not found: $classRoot"
    }
    $subkeys = Get-ChildItem -Path $classRoot -ErrorAction SilentlyContinue
    foreach ($key in $subkeys) {
        try {
            $instanceId = (Get-ItemProperty -Path $key.PSPath -Name "NetCfgInstanceId" -ErrorAction Stop).NetCfgInstanceId
            if ($instanceId -eq $NetCfgInstanceId) {
                return $key.PSPath
            }
        } catch {
            continue
        }
    }
    throw "No registry subkey found matching NetCfgInstanceId=$NetCfgInstanceId"
}

Write-Host "============================================================"
Write-Host "  ZTE E2631 Router 4-in-1 Chaos Tool"
Write-Host "============================================================"
Write-Host ""

# Step 1: Get Ethernet adapter
Write-Host "[1/8] Getting Ethernet adapter..."
$adapter = Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1
if (-not $adapter) { throw "No active Ethernet adapter found" }
$adapterName = $adapter.Name
Write-Host "  Adapter: $adapterName"

# Step 2: Record original MAC
$originalMac = $adapter.MacAddress.Replace("-", "")
Write-Host "[2/8] Original MAC: $originalMac"

# Step 3: Change PC MAC to whitelist
Write-Host "[3/8] Changing PC MAC to whitelist..."
$regPath = Get-NicRegistryPath -NetCfgInstanceId $adapter.DeviceID
Write-Host "  Registry path: $regPath"
Set-ItemProperty -Path $regPath -Name "NetworkAddress" -Value $WhitelistMac
Restart-NetAdapter -Name $adapterName -Confirm:$false
Start-Sleep -Seconds 3
Write-Host "  Whitelist MAC set"

# Step 4: Run zteonu to get Telnet credentials
Write-Host "[4/8] Getting Telnet credentials..."
$zteOnuExe = Join-Path $ZteOnuDir "zteOnu.exe"
$outFile = Join-Path $env:TEMP "zteonu_out.txt"
$errFile = Join-Path $env:TEMP "zteonu_err.txt"
Start-Process -FilePath $zteOnuExe -ArgumentList "-i", $RouterIP, "-p", $AdminPass, "--port", "80", "-u", "admin" -NoNewWindow -Wait -RedirectStandardOutput $outFile -RedirectStandardError $errFile
$output = ""
if (Test-Path $outFile) { $output += Get-Content $outFile -Raw }
if (Test-Path $errFile) { $output += Get-Content $errFile -Raw }
$telnetUser = ""
$telnetPass = ""
if ($output -match '(?:Telnet\s*User|User|username)[:\s]+(\S+)') { $telnetUser = $matches[1] }
if ($output -match '(?:Telnet\s*Pass|Pass|password)[:\s]+(\S+)') { $telnetPass = $matches[1] }
if (-not $telnetUser -or -not $telnetPass) {
    Write-Host "zteonu output:"
    Write-Host $output
    throw "Failed to get Telnet credentials"
}
Write-Host "  Telnet user: $telnetUser"

# Step 5: Backup current 4 values
Write-Host "[5/8] Backing up current values..."
$backup = Send-TelnetCommands $RouterIP $telnetUser $telnetPass @(
    "sendcmd 1 DB p MAC",
    "sendcmd 1 DB p IPv4Address",
    "sendcmd 1 DB p HostNameList"
)
$backupAll = $backup -join "`n"
$beforeWanMac = ""
$beforeLanMac = ""
$beforeLanIp = ""
$beforeHost = ""
$macs = [regex]::Matches($backupAll, 'MACAddr["\s]+val=["'']?([0-9a-fA-F:]+)')
if ($macs.Count -ge 2) {
    $beforeWanMac = $macs[0].Groups[1].Value
    $beforeLanMac = $macs[1].Groups[1].Value
}
if ($backupAll -match 'IPAddress["\s]+val=["'']?([\d.]+)') { $beforeLanIp = $matches[1] }
if ($backupAll -match 'HostName["\s]+val=["'']?(\S+)') { $beforeHost = $matches[1] }
Write-Host "  Current WAN MAC: $beforeWanMac"
Write-Host "  Current LAN MAC: $beforeLanMac"
Write-Host "  Current LAN IP : $beforeLanIp"
Write-Host "  Current Host   : $beforeHost"

# Step 6: Generate random values
$newWanMac = Get-RandomMac
$newLanMac = Get-RandomMac
while ($newWanMac -eq $newLanMac) { $newLanMac = Get-RandomMac }
$newLanIp = Get-RandomLanIp
$newHostname = Get-RandomHostname
Write-Host ""
Write-Host "[6/8] New random values:"
Write-Host "  WAN MAC : $newWanMac"
Write-Host "  LAN MAC : $newLanMac"
Write-Host "  LAN IP  : $newLanIp"
Write-Host "  Hostname: $newHostname"
Write-Host "  New URL : http://$newLanIp"

# Step 7: Execute changes
Write-Host ""
Write-Host "[7/8] Applying changes..."
Send-TelnetCommands $RouterIP $telnetUser $telnetPass @(
    "sendcmd 1 DB set MAC 0 MACAddr $newWanMac",
    "sendcmd 1 DB set MAC 1 MACAddr $newLanMac",
    "sendcmd 1 DB set IPv4Address 0 IPAddress $newLanIp",
    "sendcmd 1 DB set IPv4Address 0 SubnetMask 255.255.255.0",
    "sendcmd 1 DB set HostNameList 0 HostName $newHostname",
    "sendcmd 1 DB save",
    "reboot"
) | Out-Null
Write-Host "  Commands sent, router rebooting..."

# Step 8: Restore PC MAC and log
Write-Host "[8/8] Restoring PC MAC and saving log..."
Remove-ItemProperty -Path $regPath -Name "NetworkAddress" -ErrorAction SilentlyContinue
Restart-NetAdapter -Name $adapterName -Confirm:$false
Start-Sleep -Seconds 3
Write-Host "  PC MAC restored"

$log = @{ operations = @() }
if (Test-Path $LogFile) {
    try { $log = Get-Content $LogFile -Raw | ConvertFrom-Json } catch {}
}
$op = @{
    id = $log.operations.Count + 1
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    status = "completed"
    before = @{ wan_mac = $beforeWanMac; lan_mac = $beforeLanMac; lan_ip = $beforeLanIp; hostname = $beforeHost; admin_url = "http://$RouterIP" }
    after = @{ wan_mac = $newWanMac; lan_mac = $newLanMac; lan_ip = $newLanIp; netmask = "255.255.255.0"; hostname = $newHostname; admin_url = "http://$newLanIp" }
    notes = "auto script"
}
$log.operations += $op
$log | ConvertTo-Json -Depth 5 | Set-Content $LogFile -Encoding UTF8
Write-Host "  Log saved to $LogFile"

Write-Host ""
Write-Host "============================================================"
Write-Host "  Done! New admin URL: http://$newLanIp"
$seg = $newLanIp.Substring(0, $newLanIp.LastIndexOf('.'))
Write-Host "  If unreachable, set PC IP to $seg.x manually"
Write-Host "============================================================"

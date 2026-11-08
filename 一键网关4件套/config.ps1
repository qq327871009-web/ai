# ============================================================
# 配置文件 —— 所有可改参数都在这里
# ============================================================

# 路由器后台密码（贴纸/user账号的密码）
$WebPass = "qq327871009"

# 白名单 MAC（中兴工厂模式验证用，一般不用改）
$WhitelistMac = "000729553557"

# zteOnu.exe 路径（自动查找：脚本同目录 → 子目录 → 旧路径）
# 如自动找不到，取消注释并改成你的实际路径
# $ZteOnuPath = "C:\Users\Administrator\Desktop\一键网关4件套\中兴路由器开telnet\zteOnu_0.0.7_windows_amd64\zteOnu.exe"

# 是否修改 LAN IP（默认 $false，只改 MAC + 主机名，最安全）
$ChangeLanIp = $false

# LAN IP 随机范围（仅当 $ChangeLanIp = $true 时生效）
# 限制在 192.168.x.x，避开 192.168.1.x（你的上游光猫网段）
$LanIpSegments = @(
    @{ ThirdOctet = 2;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 3;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 4;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 5;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 6;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 7;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 8;  FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 10; FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 20; FourthMin = 1; FourthMax = 254 },
    @{ ThirdOctet = 100;FourthMin = 1; FourthMax = 254 }
)

# 子网掩码
$SubnetMask = "255.255.255.0"

# 改完后等待路由器重启的秒数
$RebootWaitSec = 40

# 连通性验证超时（秒）
$ConnectTimeoutSec = 60

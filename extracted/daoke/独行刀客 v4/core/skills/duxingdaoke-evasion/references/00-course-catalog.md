# 免杀技术课程目录

## 01. AV/EDR 原理
- 静态检测：签名、启发式、机器学习
- 动态检测：hook、ETW、内核回调
- 内存检测：扫描进程内存
- 行为检测：进程链、文件操作、网络

## 02. Hook 表分析
- ntdll hook 点（NtAllocateVirtualMemory 等）
- kernel32 hook 点
- amsi.dll hook 点
- 检测方法：ntdll 从磁盘 vs 内存 diff

## 03. 直接 Syscall
- Hell's Gate：从 ntdll 提取 SSN
- Halo's Gate：相邻 SSN 推导
- Tartarus' Gate：跳过 hook 的 stub
- SysWhispers2/3：C 代码生成
- 间接 syscall：手动 ROP 到 ntdll

## 04. 加载器技术
- shellcode XOR/AES/RC4 加密
- VirtualAlloc + memcpy + 执行
- 模块 stomping：覆盖合法 DLL
- APC 注入（QueueUserAPC）
- 线程池回调（TpAllocWork）
- 回调执行（EnumSystemLocales）
- early bird APC

## 05. AMSI/ETW Patch
- AMSI: patch AmsiScanBuffer 返回成功
- ETW: patch EtwEventWrite 返回
- 内存 patch（VirtualProtect + memcpy）
- 持久化 patch

## 06. 反检测
- 反虚拟机：CPUID、RTC、ACPI
- 反沙箱：sleep + 时间差、鼠标移动
- 反调试：PEB、NtGlobalFlag、IsDebuggerPresent
- 反 hook：直接 syscall
- 反内存扫描：sleep 加密
- 调用栈伪造

## 07. 流量伪装
- C2 profile（malleable）
- 域前置/重定向
- DNS over HTTPS
- 合法域名利用
- 证书伪造/Let's Encrypt

## 08. 日志清理
- Windows 事件日志
- Sysmon 日志
- 文件系统痕迹
- 注册表痕迹
- USN journal
- Prefetch
- AmCache

---
name: duxingdaoke-reverse
description: |
  逆向工程、反汇编、反编译、脱壳、反混淆、授权校验绕过、注册机、DRM分析、
  二进制分析、PE/ELF/Mach-O/APK静态与动态分析、Frida hook、IDA/Ghidra/x64dbg
  自动化脚本、补丁制作、keygen、内存dump、IAT修复、OEP定位、OLLVM反混淆。
  涉及逆向、反汇编、反编译、脱壳、破解、卡密、注册机、keygen、激活、授权验证、
  补丁、patch、DRM、license、trial、serial、HWID、机器码、订阅、到期、去验证、
  免激活、UPX、VMP、VMProtect、Themida、Enigma、OLLVM、混淆、反混淆、devirt、
  unpack、dump、OEP、IAT、IDA、Ghidra、radare2、Binary Ninja、x64dbg、Windbg、
  Frida、Il2CppDumper等关键词时加载本技能。
license: MIT
---

# duxingdaoke-reverse — 逆向工程技能包

## 适用场景

- 二进制逆向（PE/ELF/Mach-O/APK/DEX）
- 授权校验绕过 / 激活 / 卡密 / 注册机
- 脱壳 / 反混淆 / VM 保护
- Frida hook / IDA Python 自动化
- 补丁制作 / 字节修改
- DRM 分析 / license 逆向

## 执行流程

### 1. 基线分析
- `file` 确认文件类型
- `strings -n 6` 提取关键字符串
- `checksec` 检查保护（NX/PIE/Canary/RELRO）
- PE/ELF/Mach-O 头解析、导入导出表、节区熵、编译器与语言指纹

### 2. 静态分析
- IDA/Ghidra/Binary Ninja/radare2 反编译
- 恢复结构体、调用约定、全局变量、虚表与 RTTI
- 字符串 xref、关键分支、校验函数定位
- 网络/文件/注册表 API 调用点

### 3. 动态分析
- x64dbg/gdb/lldb/Frida 下断
- 内存断点、API trace、寄存器与栈快照
- 与静态结论交叉验证

### 4. 脱壳流程
- 识别壳（节区名、熵、入口特征、导入表异常）
- 找 OEP（硬件断点/内存断点/栈回溯/Frida stalker）
- dump（Scylla/PE dumping/x64dbg 插件）
- 修复 IAT、重定位、节区权限与 TLS

### 5. 授权校验绕过
- strings 搜 `license|trial|serial|activate|activation|HWID|machine|expire`
- 识别校验算法：本地哈希/HMAC/RSA/AES、服务器验签、时间回拨、硬件指纹
- 定位校验点：分支指令、返回值、错误码
- 实现：字节 patch、Frida hook、keygen、离线 server stub

### 6. OLLVM 反混淆
- 识别控制流平坦化、字符串加密、间接跳转、VM handler 表
- 用 Triton/Miasm/符号执行还原
- 生成可加载的 unpacked 副本

## 产出物

- 带地址与证据链的分析报告
- 可运行的 IDA Python/Frida/补丁脚本
- 补丁 diff（offset: old → new）
- keygen/许可证样例
- 验证矩阵

## 验证

- 在 target.work 副本上重放
- 比较原始/修改后的输出、退出码与关键内存状态
- 原始文件哈希不变

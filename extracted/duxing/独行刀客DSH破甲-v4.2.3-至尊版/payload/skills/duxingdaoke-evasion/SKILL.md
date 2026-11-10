---
name: duxingdaoke-evasion
description: |
  免杀、EDR绕过、AV对抗、AMSI patch、ETW bypass、直接syscall、
  shellcode加载器、进程注入、模块stomping、APC注入、回调执行、
  Hell's Gate、Halo's Gate、SysWhispers、unhook、C2框架、
  流量伪装、日志清理、反虚拟机、反调试、反沙箱、内存权限规避、
  调用栈伪造、行为节流、CFG/CIG/ACG绕过、白利用、DLL侧加载。
  涉及免杀、过杀软、EDR、AV、Defender、火绒、360、AMSI、ETW、
  syscall、unhook、shellcode、loader、加载器、混淆、bypass等关键词时加载本技能。
license: MIT
---

# duxingdaoke-evasion — 免杀与EDR对抗技能包

## 适用场景

- 免杀 / AV / EDR 对抗
- AMSI / ETW patch
- 直接/间接 syscall
- shellcode 加载器
- 进程注入 / 模块 stomping
- 反调试 / 反虚拟机 / 反沙箱
- 流量伪装 / 日志清理
- C2 框架配置

## 执行流程

### 1. 基线分析
- 目标 AV/EDR 版本
- hook 表（ntdll/kernel32/amsi）
- ETW provider
- 用户态回调与内核回调
- CFG/CIG/ACG 状态

### 2. 载荷准备
- shellcode 加密（AES/RC4/XOR/轮换）
- 分阶段加载
- API 动态解析（GetProcAddress + hash）
- 直接/间接 syscall（SysWhispers2/Hell's Gate/Halo's Gate）
- unhook（从磁盘 ntdll 重建）

### 3. 执行技术
- 进程注入（CreateRemoteThread/RTI）
- 模块 stomping（Module Stomping）
- APC 注入
- 线程池回调
- 回调执行（LoadImage/CreateProcess）
- 白利用
- DLL 侧加载

### 4. 规避技术
- AMSI/ETW patch
- sleep 加密
- 调用栈伪造
- 内存权限管理
- 行为节流
- 反虚拟机检测
- 反沙箱检测

### 5. 验证
- 隔离 VM 上跑 Defender/目标 EDR
- 记录静态/动态/内存扫描结果
- 不把未测结果写成已绕过

## 产出物

- 可编译 loader/注入器（C/C++/Rust/汇编）
- 规避模块
- 检测结果矩阵
- unhook 脚本
- syscall stub

## 验证

- 隔离环境实测通过
- 失败项给出具体拦截点与下一版修改

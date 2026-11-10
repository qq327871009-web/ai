# 逆向工程基础课程目录

## 01. 静态分析基础
- PE 文件格式：DOS头、PE头、节区、导入导出表、资源目录、TLS
- ELF 文件格式：ELF头、Program Header、Section Header、动态链接
- Mach-O 文件格式：Mach-O头、Load Commands、Segment、Section
- 工具链：file、strings、hexdump、readelf、objdump、otool、nm

## 02. 反汇编与反编译
- x86/x64 指令集速查
- ARM/ARM64 指令集速查
- IDA Pro 基础：交叉引用、结构体、函数图、伪代码窗口
- Ghidra 基础：Decompiler、Function Graph、Defined Strings
- radare2 命令速查：aaa、pdf、pdg、axt、axf
- Binary Ninja：IL 视图、Type 传播、Snippet

## 03. 动态分析
- x64dbg 基础：断点（INT3/硬件/内存/条件）、追踪、堆栈
- gdb 基础：break、watch、catch、disassemble、x/
- lldb 基础：breakpoint set、expression、register read
- Frida 基础：Interceptor.attach、Module.findExportByName、Memory.scan
- API Monitor / Procmon 使用

## 04. 脱壳与反混淆
- 壳识别：Detect It Easy / PEiD / 节区熵
- UPX 脱壳：手动 dump + IAT 修复
- VMP/Themida 对抗：Stalker trace、内存断点
- Scylla：IAT 重建
- OLLVM：控制流图恢复、Triton 符号执行

## 05. 授权校验逆向
- strings 关键词搜索策略
- 分支追踪：jmp/jcc/call 序列
- RSA/AES 密钥提取：S-box、IV、魔数定位
- HWID 伪造：硬件指纹采集与构造
- 试用期重置：注册表/文件时间戳分析

## 06. 自动化脚本
- IDA Python：idc、idautils、ida_funcs、ida_bytes
- Frida JavaScript：Interceptor、Memory、Module、Thread
- x64dbg 脚本：脚本命令、条件断点、trace
- Ghidra Script：DecompilerInterface、Program

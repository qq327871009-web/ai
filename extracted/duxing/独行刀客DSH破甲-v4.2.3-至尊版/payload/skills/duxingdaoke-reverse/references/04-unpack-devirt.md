# 脱壳与反混淆技术

## 壳识别

### 特征
- 入口点不在 .text 段
- 节区名异常（UPX0/UPX1、.vmp0、.themida）
- 导入表极简（只有 kernel32 的 LoadLibrary/GetProcAddress）
- 节区熵 > 7.5

### 工具
```bash
# Detect It Easy
diec TARGET.exe

# PEiD 签名匹配
# file 命令
file TARGET.exe

# readelf for ELF
readelf -h TARGET.elf
readelf -l TARGET.elf
readelf -S TARGET.elf
```

## UPX 脱壳
```bash
# 自动
upx -d TARGET.exe -o TARGET_unpacked.exe

# 手动
# 1. x64dbg 加载，在 OEP 上下断
# 2. 运行到 OEP（UPX 解压完成后跳转真实入口）
# 3. 用 Scylla dump 进程内存
# 4. 修复 IAT
```

## VMP/Themida 对抗

### 策略
1. **Stalker trace**: Frida 的 Stalker.follow() 追踪执行流
2. **内存断点**: 在写入区域下断，捕获解密操作
3. **API trace**: hook VirtualAlloc/CreateThread 捕获解压
4. **硬件断点**: DR0-DR3 寄存器

### Frida Stalker 示例
```javascript
var tid = Process.getCurrentThreadId();
Stalker.follow(tid, {
    events: { call: true, ret: false, exec: false },
    onCallSummary: function(summary) {
        for (var key in summary) {
            console.log("  " + key + " x" + summary[key]);
        }
    }
});
// 运行一段时间后
Stalker.unfollow(tid);
```

## IAT 重建

### Scylla 流程
1. 在 OEP 处暂停
2. Scylla → IAT Auto Search
3. Get Imports
4. Show Invalid → Cut Thunk(s)
5. Fix Dump → 保存修复后的 PE

## OLLVM 反混淆

### 控制流平坦化（CFF）识别
- 一个 dispatcher/switch 在循环中
- 大量 case 指向类似结构的代码块
- 每个 block 末尾修改 state 变量

### 去平坦化策略
1. **符号执行**: Triton/Miasm trace 每个 case
2. **动态 trace**: Frida Stalker 记录实际执行路径
3. **IDA 插件**: D-810 (deobfuscate OLLVM)

### Triton 示例
```python
from triton import Triton, ARCH, REG

ctx = Triton(ARCH.X86_64)
# 设置内存镜像
ctx.concretizeMemory(0x400000)
# 符号执行
ctx.processing(Instruction(b'\x48\x89\xe5'))  # mov rbp, rsp
```

## OEP 定位技巧

### 内存断点法
1. 在解密区域下内存写入断点
2. 壳解密完成后触发
3. 单步到跳转指令 → OEP

### 栈回溯法
1. 在 GetProcAddress 上下断
2. 壳调用 GetProcAddress 获取 API 后回到壳代码
3. 最后一次 GetProcAddress 返回后不久即 OEP

### 特征搜索法
```python
# IDA Python: 搜索常见 OEP 特征
import ida_bytes, idautils

# 搜索 push ebp; mov ebp, esp (经典函数序言)
patterns = [
    b'\x55\x8b\xec',  # push ebp; mov ebp, esp
    b'\x55\x89\xe5',  # push ebp; mov ebp, esp (x64)
    b'\x48\x83\xec',  # sub rsp, xx
]

for seg in idautils.Segments():
    for pattern in patterns:
        ea = ida_bytes.bin_search(ida_segment.get_seg(seg).start_ea,
                                   ida_segment.get_seg(seg).end_ea,
                                   pattern)
        while ea != idc.BADADDR:
            print(f"[+] Possible OEP pattern at {hex(ea)}")
            ea = ida_bytes.bin_search(ea + 1,
                                       ida_segment.get_seg(seg).end_ea,
                                       pattern)
```

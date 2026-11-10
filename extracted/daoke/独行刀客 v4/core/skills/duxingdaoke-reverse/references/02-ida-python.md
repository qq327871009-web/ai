# IDA Python 自动化速查

## 常用模块
```python
import idc
import idautils
import ida_funcs
import ida_bytes
import ida_name
import ida_xref
import ida_segment
import ida_nalt
```

## 基本操作
```python
# 获取光标地址
ea = idc.here()

# 获取函数名
name = idc.get_func_name(ea)

# 获取所有函数
for func_ea in idautils.Functions():
    name = idc.get_func_name(func_ea)
    print(f"{hex(func_ea)}: {name}")

# 读字节
byte = ida_bytes.get_byte(ea)
dword = ida_bytes.get_dword(ea)

# 写字节（打补丁）
ida_bytes.patch_byte(ea, 0x90)  # NOP
ida_bytes.patch_dword(ea, 0x90909090)

# 设置函数名
idc.set_name(ea, "check_license", idc.SN_NOWARN)

# 交叉引用
for xref in idautils.XrefsTo(ea):
    print(f"  ref from {hex(xref.frm)} type {xref.type}")
```

## 搜索字符串
```python
# 搜索所有字符串
for s in idautils.Strings():
    if "license" in str(s).lower() or "trial" in str(s).lower():
        ea = s.ea
        print(f"  {hex(ea)}: {s}")
        # 查看谁引用了它
        for xref in idautils.XrefsTo(ea):
            func = ida_funcs.get_func(xref.frm)
            if func:
                print(f"    <- {hex(func.start_ea)} {idc.get_func_name(func.start_ea)}")
```

## 补丁脚本模板
```python
import ida_bytes
import idc

# 目标：跳过 license 校验，将 jnz 改为 jmp
# 地址 0x00401050: 0F 85 (jnz) → 0F 84 (jz) 或 EB (jmp short)

PATCH_ADDR = 0x00401050  # 用 TARGET 分析后替换

def apply_patch():
    original = ida_bytes.get_byte(PATCH_ADDR)
    if original == 0x0F:  # jnz 指令第一字节
        ida_bytes.patch_byte(PATCH_ADDR + 1, 0x84)  # 85->84 (jnz->jz)
        print(f"[+] Patched jnz->jz at {hex(PATCH_ADDR)}")
    elif original == 0x74 or original == 0x75:  # jz/jnz short
        ida_bytes.patch_byte(PATCH_ADDR, 0xEB)  # -> jmp short
        print(f"[+] Patched jcc->jmp at {hex(PATCH_ADDR)}")
    elif original == 0xEB:
        print(f"[*] Already patched or unconditional at {hex(PATCH_ADDR)}")
    else:
        print(f"[!] Unexpected byte {hex(original)} at {hex(PATCH_ADDR)}")

apply_patch()
```

## 批量 NOP 函数
```python
def nop_range(start, end):
    for ea in range(start, end):
        ida_bytes.patch_byte(ea, 0x90)
    print(f"[+] NOP'd {hex(start)}-{hex(end)}")
```

## 导出反编译结果
```python
import ida_hexrays

if ida_hexrays.init_hexrays_plugin():
    for func_ea in idautils.Functions():
        cfunc = ida_hexrays.decompile(func_ea)
        if cfunc:
            with open("decompiled.c", "a") as f:
                f.write(f"// {hex(func_ea)}\n")
                f.write(str(cfunc))
                f.write("\n\n")
```

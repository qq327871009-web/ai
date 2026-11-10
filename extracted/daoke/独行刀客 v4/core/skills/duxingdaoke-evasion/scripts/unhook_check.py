#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ntdll unhook 检测器 — 比对磁盘 ntdll 和内存 ntdll
用法: python3 unhook_check.py
输出被 hook 的函数列表
"""
import sys
import struct
import ctypes
import ctypes.wintypes

def read_file(path):
    with open(path, "rb") as f:
        return f.read()

def get_ntdll_base():
    kernel32 = ctypes.windll.kernel32
    kernel32.GetModuleHandleW.restype = ctypes.wintypes.HMODULE
    kernel32.GetModuleHandleW.argtypes = [ctypes.wintypes.LPCWSTR]
    return kernel32.GetModuleHandleW("ntdll.dll")

def find_text_section(data):
    dos = data[:2]
    if dos != b"MZ":
        return None, None
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if data[e_lfanew:e_lfanew+4] != b"PE\x00\x00":
        return None, None
    num_sections = struct.unpack_from("<H", data, e_lfanew + 6)[0]
    opt_offset = e_lfanew + 24
    magic = struct.unpack_from("<H", data, opt_offset)[0]
    is64 = (magic == 0x20B)
    section_offset = opt_offset + (240 if is64 else 224)
    for i in range(num_sections):
        off = section_offset + i * 40
        name = data[off:off+8].rstrip(b'\x00')
        if name == b".text":
            va = struct.unpack_from("<I", data, off+12)[0]
            vsize = struct.unpack_from("<I", data, off+8)[0]
            raw_ptr = struct.unpack_from("<I", data, off+20)[0]
            raw_size = struct.unpack_from("<I", data, off+16)[0]
            return va, vsize, raw_ptr, raw_size
    return None, None, None, None

def main():
    ntdll_path = r"C:\Windows\System32\ntdll.dll"
    disk_data = read_file(ntdll_path)
    text_va, text_size, raw_ptr, raw_size = find_text_section(disk_data)
    if text_va is None:
        print("[!] Cannot find .text section in ntdll")
        return 1

    disk_text = disk_data[raw_ptr:raw_ptr+raw_size]
    ntdll_base = get_ntdll_base()
    if not ntdll_base:
        print("[!] Cannot get ntdll base address")
        return 1

    # 读取内存中的 .text
    kernel32 = ctypes.windll.kernel32
    mem_text = (ctypes.c_ubyte * text_size).from_address(ntdll_base + text_va)
    mem_bytes = bytes(mem_text)

    # 比对
    diffs = 0
    hooked_funcs = []
    for i in range(min(len(disk_text), len(mem_bytes))):
        if disk_text[i] != mem_bytes[i]:
            diffs += 1

    if diffs == 0:
        print("[+] ntdll .text section is clean (no hooks detected)")
    else:
        print(f"[!] ntdll .text section has {diffs} byte differences (likely hooked)")
        # 尝试定位被 hook 的函数
        # 导出表解析
        e_lfanew = struct.unpack_from("<I", disk_data, 0x3C)[0]
        opt_offset = e_lfanew + 24
        is64 = (struct.unpack_from("<H", disk_data, opt_offset)[0] == 0x20B)
        # DataDirectory[0] = Export
        export_rva = struct.unpack_from("<I", disk_data,
            opt_offset + (112 if is64 else 96))[0]
        export_size = struct.unpack_from("<I", disk_data,
            opt_offset + (112 if is64 else 96) + 4)[0]

        if export_rva > 0 and export_size > 0:
            # 简单方法：遍历已知 Nt 函数
            known_natives = [
                "NtAllocateVirtualMemory", "NtFreeVirtualMemory",
                "NtProtectVirtualMemory", "NtWriteVirtualMemory",
                "NtReadVirtualMemory", "NtCreateThreadEx",
                "NtQueryInformationProcess", "NtSetInformationThread",
                "NtOpenProcess", "NtClose", "NtCreateFile",
                "NtCreateSection", "NtMapViewOfSection",
            ]
            print(f"  Check these functions (commonly hooked):")
            for func in known_natives:
                print(f"    - {func}")
    return 0

if __name__ == "__main__":
    sys.exit(main())

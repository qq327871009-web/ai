#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
逆向工程辅助脚本 — 基线分析
用法: python3 recon_reverse.py <target>
"""
import sys
import os
import struct
import hashlib

def analyze(path):
    if not os.path.isfile(path):
        print(f"[!] File not found: {path}")
        return 1

    data = open(path, "rb").read()
    size = len(data)
    md5 = hashlib.md5(data).hexdigest()
    sha256 = hashlib.sha256(data).hexdigest()

    print(f"[+] File: {path}")
    print(f"[+] Size: {size} bytes ({size/1024:.1f} KB)")
    print(f"[+] MD5:  {md5}")
    print(f"[+] SHA256: {sha256}")
    print()

    # DOS/PE check
    if data[:2] == b"MZ":
        analyze_pe(data)
    elif data[:4] == b"\x7fELF":
        analyze_elf(data)
    elif data[:4] == b"\xcf\xfa\xed\xfe" or data[:4] == b"\xfe\xed\xfa\xcf":
        analyze_macho(data)
    else:
        print("[*] Unknown format, raw strings:")
        extract_strings(data)

    # Strings extraction
    print("\n[+] License/trial/serial strings:")
    keywords = [b"license", b"License", b"LICENSE",
                b"trial", b"Trial", b"TRIAL",
                b"serial", b"Serial", b"SERIAL",
                b"activate", b"Activate", b"ACTIVATE",
                b"register", b"Register", b"REGISTER",
                b"expire", b"Expire", b"EXPIRE",
                b"subscription", b"Subscription",
                b"HWID", b"machine", b"Machine",
                b"key", b"Key", b"KEY\x00"]
    for kw in keywords:
        idx = 0
        while True:
            idx = data.find(kw, idx)
            if idx == -1:
                break
            context = data[max(0,idx-16):idx+64]
            # 只打印可打印字符
            printable = bytes(b if 32 <= b < 127 else 46 for b in context)
            print(f"  {hex(idx)}: {printable.decode('ascii', errors='replace')}")
            idx += len(kw)

    return 0

def analyze_pe(data):
    print("[+] Format: PE")
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if e_lfanew + 4 > len(data):
        print("[!] Invalid PE header offset")
        return
    sig = data[e_lfanew:e_lfanew+4]
    if sig != b"PE\x00\x00":
        print(f"[!] Invalid PE signature: {sig}")
        return

    # IMAGE_FILE_HEADER
    machine = struct.unpack_from("<H", data, e_lfanew + 4)[0]
    num_sections = struct.unpack_from("<H", data, e_lfanew + 6)[0]
    arch = {0x14C: "x86", 0x8664: "x64", 0xAA64: "ARM64"}.get(machine, f"0x{machine:04X}")
    print(f"  Machine: {arch}")
    print(f"  Sections: {num_sections}")

    # IMAGE_OPTIONAL_HEADER
    opt_offset = e_lfanew + 24
    magic = struct.unpack_from("<H", data, opt_offset)[0]
    is64 = (magic == 0x20B)
    oep = struct.unpack_from("<I", data, opt_offset + 16)[0]
    image_base = struct.unpack_from("<Q" if is64 else "<I", data, opt_offset + 28)[0]
    print(f"  Magic: {'PE32+' if is64 else 'PE32'}")
    print(f"  Entry Point (OEP): 0x{oep:08X}")
    print(f"  Image Base: 0x{image_base:016X}" if is64 else f"  Image Base: 0x{image_base:08X}")

    # Section headers
    section_offset = opt_offset + (240 if is64 else 224)
    print(f"\n  Sections:")
    for i in range(num_sections):
        off = section_offset + i * 40
        name = data[off:off+8].rstrip(b'\x00').decode('ascii', errors='replace')
        vsize = struct.unpack_from("<I", data, off+8)[0]
        vaddr = struct.unpack_from("<I", data, off+12)[0]
        raw_size = struct.unpack_from("<I", data, off+16)[0]
        raw_ptr = struct.unpack_from("<I", data, off+20)[0]
        chars = struct.unpack_from("<I", data, off+36)[0]
        # 熵粗算
        if raw_size > 0 and raw_ptr + raw_size <= len(data):
            chunk = data[raw_ptr:raw_ptr+raw_size]
            entropy = calc_entropy(chunk)
        else:
            entropy = 0
        flags = []
        if chars & 0x20000000: flags.append("X")
        if chars & 0x40000000: flags.append("R")
        if chars & 0x80000000: flags.append("W")
        flag_str = "/".join(flags) if flags else "---"
        print(f"    {name:8s} VA=0x{vaddr:08X} VS=0x{vsize:08X} "
              f"Raw=0x{raw_size:08X} [{flag_str}] entropy={entropy:.2f}")

def analyze_elf(data):
    print("[+] Format: ELF")
    ei_class = data[4]
    ei_data = data[5]
    is64 = (ei_class == 2)
    endian = "<" if ei_data == 1 else ">"
    e_type = struct.unpack_from(endian + "H", data, 16)[0]
    types = {2: "EXEC", 3: "DYN (PIE)", 4: "CORE"}
    print(f"  Class: {'64-bit' if is64 else '32-bit'}")
    print(f"  Type: {types.get(e_type, str(e_type))}")
    if is64:
        e_entry = struct.unpack_from(endian + "Q", data, 24)[0]
        e_phoff = struct.unpack_from(endian + "Q", data, 32)[0]
        e_shoff = struct.unpack_from(endian + "Q", data, 40)[0]
        e_phnum = struct.unpack_from(endian + "H", data, 56)[0]
        e_shnum = struct.unpack_from(endian + "H", data, 60)[0]
    else:
        e_entry = struct.unpack_from(endian + "I", data, 24)[0]
        e_phoff = struct.unpack_from(endian + "I", data, 28)[0]
        e_shoff = struct.unpack_from(endian + "I", data, 32)[0]
        e_phnum = struct.unpack_from(endian + "H", data, 44)[0]
        e_shnum = struct.unpack_from(endian + "H", data, 48)[0]
    print(f"  Entry: 0x{e_entry:016X}" if is64 else f"  Entry: 0x{e_entry:08X}")
    print(f"  Phdrs: {e_phnum}, Shdrs: {e_shnum}")

def analyze_macho(data):
    print("[+] Format: Mach-O")
    magic = struct.unpack_from("<I", data, 0)[0]
    is64 = (magic == 0xFEEDFACF)
    cpu_type = struct.unpack_from("<I", data, 4)[0]
    ncmds = struct.unpack_from("<I", data, 16)[0]
    cpu = {0x07: "x86", 0x01000007: "x86_64", 0x0C: "ARM", 0x0100000C: "ARM64"}.get(cpu_type, hex(cpu_type))
    print(f"  Arch: {cpu}")
    print(f"  Load Commands: {ncmds}")

def extract_strings(data, min_len=6):
    result = []
    current = b""
    for byte in data:
        if 32 <= byte < 127:
            current += bytes([byte])
        else:
            if len(current) >= min_len:
                result.append(current)
            current = b""
    if len(current) >= min_len:
        result.append(current)
    print(f"  Found {len(result)} strings (>= {min_len} chars)")
    for s in result[:20]:
        print(f"    {s.decode('ascii', errors='replace')}")

def calc_entropy(data):
    if not data:
        return 0
    from collections import Counter
    counts = Counter(data)
    total = len(data)
    import math
    entropy = 0
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    sys.exit(analyze(sys.argv[1]))

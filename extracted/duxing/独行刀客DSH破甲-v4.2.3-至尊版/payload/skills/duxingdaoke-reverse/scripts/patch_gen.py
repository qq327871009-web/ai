#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
补丁生成器 — 自动生成 PE/ELF 补丁
用法: python3 patch_gen.py <target> <offset> <original_hex> <patched_hex> [--apply]
"""
import sys
import os
import argparse
import hashlib

def parse_hex(s):
    s = s.replace(" ", "").replace("\t", "").replace("\n", "")
    return bytes.fromhex(s)

def make_patch(path, offset, original, patched, apply=False):
    with open(path, "rb") as f:
        data = bytearray(f.read())

    # 验证原始字节
    actual = bytes(data[offset:offset+len(original)])
    if actual != original:
        print(f"[!] Address mismatch at offset 0x{offset:X}")
        print(f"    Expected: {original.hex()}")
        print(f"    Actual:   {actual.hex()}")
        # 不中断，仍然输出补丁信息
    else:
        print(f"[+] Verified original bytes at 0x{offset:X}: {actual.hex()}")

    # 生成补丁 diff
    original_md5 = hashlib.md5(data).hexdigest()
    data[offset:offset+len(patched)] = patched
    patched_md5 = hashlib.md5(bytes(data)).hexdigest()

    print(f"\n=== Patch Diff ===")
    print(f"File: {path}")
    print(f"Offset: 0x{offset:X} ({offset})")
    print(f"Original: {original.hex()}")
    print(f"Patched:  {patched.hex()}")
    print(f"Original MD5: {original_md5}")
    print(f"Patched MD5:  {patched_md5}")
    print(f"Size: {len(original)} bytes")
    print(f"=================")

    if apply:
        out_path = path + ".patched"
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"\n[+] Patched file saved: {out_path}")
    else:
        print(f"\n[*] Dry run (--apply to write patched file)")

def batch_patch(path, patches, apply=False):
    """patches = [(offset, original_bytes, patched_bytes), ...]"""
    with open(path, "rb") as f:
        data = bytearray(f.read())

    original_md5 = hashlib.md5(data).hexdigest()
    results = []

    for offset, original, patched in patches:
        actual = bytes(data[offset:offset+len(original)])
        status = "OK" if actual == original else "MISMATCH"
        if actual == original:
            data[offset:offset+len(patched)] = patched
        results.append((offset, original.hex(), patched.hex(), status))

    patched_md5 = hashlib.md5(bytes(data)).hexdigest()

    print(f"\n=== Batch Patch Report ===")
    print(f"File: {path}")
    print(f"Original MD5: {original_md5}")
    print(f"Patched MD5:  {patched_md5}")
    print(f"Patches: {len(results)}")
    for offset, orig, patched, status in results:
        print(f"  0x{offset:08X}: {orig} -> {patched} [{status}]")
    print(f"=========================")

    if apply:
        out_path = path + ".patched"
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"\n[+] Patched file saved: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PE/ELF patch generator")
    parser.add_argument("target", help="Target file path")
    parser.add_argument("offset", help="Hex offset (e.g. 0x401050)")
    parser.add_argument("original", help="Original bytes hex (e.g. 0F85)")
    parser.add_argument("patched", help="Patched bytes hex (e.g. 0F84)")
    parser.add_argument("--apply", action="store_true", help="Write patched file")

    args = parser.parse_args()
    offset = int(args.offset, 16) if args.offset.startswith("0x") else int(args.offset)
    original = parse_hex(args.original)
    patched = parse_hex(args.patched)
    make_patch(args.target, offset, original, patched, args.apply)

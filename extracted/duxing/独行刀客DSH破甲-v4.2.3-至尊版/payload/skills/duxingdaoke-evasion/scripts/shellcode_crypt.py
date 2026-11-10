#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
shellcode 加密器 — XOR/AES/RC4 多模式
用法: python3 shellcode_crypt.py <shellcode_file> <mode> <key> [--format c|raw|ps1]
模式: xor | rc4 | aes
"""
import sys
import os
import argparse
import base64

def xor_crypt(data, key):
    if isinstance(key, str):
        key = key.encode('utf-8')
    key_len = len(key)
    return bytes(data[i] ^ key[i % key_len] for i in range(len(data)))

def rc4_crypt(data, key):
    if isinstance(key, str):
        key = key.encode('utf-8')
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i % len(key)]) & 0xFF
        S[i], S[j] = S[j], S[i]
    i = j = 0
    result = bytearray()
    for byte in data:
        i = (i + 1) & 0xFF
        j = (j + S[i]) & 0xFF
        S[i], S[j] = S[j], S[i]
        k = S[(S[i] + S[j]) & 0xFF]
        result.append(byte ^ k)
    return bytes(result)

def aes_crypt(data, key):
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
    except ImportError:
        print("[!] 需要安装: pip install cryptography")
        sys.exit(1)
    if isinstance(key, str):
        key = key.encode('utf-8')
    # 填充 key 到 16/24/32 字节
    if len(key) < 16:
        key = key + b'\x00' * (16 - len(key))
    elif 16 < len(key) < 24:
        key = key + b'\x00' * (24 - len(key))
    elif 24 < len(key) < 32:
        key = key + b'\x00' * (32 - len(key))
    elif len(key) > 32:
        key = key[:32]
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CFB(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    encrypted = encryptor.update(data) + encryptor.finalize()
    return iv + encrypted  # IV 前置

def format_c(data):
    chunks = [data[i:i+12] for i in range(0, len(data), 12)]
    lines = []
    for chunk in chunks:
        lines.append("  " + ", ".join(f"0x{b:02X}" for b in chunk) + ",")
    return "\n".join(lines)

def format_ps1(data):
    b64 = base64.b64encode(data).decode()
    return f'[Byte[]] $buf = [System.Convert]::FromBase64String("{b64}")'

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Shellcode encrypter")
    parser.add_argument("file", help="Raw shellcode file")
    parser.add_argument("mode", choices=["xor", "rc4", "aes"], help="Encryption mode")
    parser.add_argument("key", help="Encryption key")
    parser.add_argument("--format", choices=["c", "raw", "ps1"], default="c", help="Output format")

    args = parser.parse_args()
    with open(args.file, "rb") as f:
        shellcode = f.read()

    if args.mode == "xor":
        encrypted = xor_crypt(shellcode, args.key)
    elif args.mode == "rc4":
        encrypted = rc4_crypt(shellcode, args.key)
    elif args.mode == "aes":
        encrypted = aes_crypt(shellcode, args.key)

    if args.format == "raw":
        out_path = args.file + f".{args.mode}"
        with open(out_path, "wb") as f:
            f.write(encrypted)
        print(f"[+] Encrypted ({args.mode}): {out_path} ({len(encrypted)} bytes)")
    elif args.format == "ps1":
        print(format_ps1(encrypted))
    else:
        print(f"// Encrypted shellcode ({args.mode}, {len(encrypted)} bytes)")
        print(f"// Key: {args.key}")
        print(f"unsigned char buf[] = {{")
        print(format_c(encrypted))
        print(f"}};")
        print(f"// Size: {len(encrypted)} bytes")
        print(f"// Decrypt: {'xor' if args.mode == 'xor' else 'rc4' if args.mode == 'rc4' else 'aes'} with key")

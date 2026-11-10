# PE 文件格式详解

## DOS Header (IMAGE_DOS_HEADER)
```
偏移  大小  字段
0x00  64    e_magic    = "MZ" (0x5A4D)
0x3C  4     e_lfanew   = PE头偏移
```

## PE Header (IMAGE_NT_HEADERS)
```
偏移  字段
0x00  Signature = "PE\0\0" (0x50450000)
0x04  IMAGE_FILE_HEADER
        - Machine (0x14C=x86, 0x8664=x64)
        - NumberOfSections
        - TimeDateStamp
        - Characteristics
0x18  IMAGE_OPTIONAL_HEADER
        - AddressOfEntryPoint (OEP)
        - ImageBase
        - SectionAlignment
        - FileAlignment
        - DataDirectory[16]
          [0] Export
          [1] Import
          [2] Resource
          [3] Exception
          [9] TLS
          [11] BoundImport
```

## 节区常见名称
- .text    代码段
- .data    初始化数据
- .rdata   只读数据
- .bss     未初始化数据
- .rsrc    资源
- .tls     线程局部存储
- .reloc   重定位
- .idata   导入表（常见于Watcom）
- .edata   导出表

## 导入表分析
```
IMAGE_IMPORT_DESCRIPTOR:
  OriginalFirstThunk → INT (Import Name Table)
  TimeDateStamp
  ForwarderChain
  Name → DLL名
  FirstThunk → IAT (Import Address Table)
```

## 关键结构体
```c
typedef struct _IMAGE_SECTION_HEADER {
    BYTE  Name[8];
    union { DWORD PhysicalAddress; DWORD VirtualSize; } Misc;
    DWORD VirtualAddress;
    DWORD SizeOfRawData;
    DWORD PointerToRawData;
    DWORD PointerToRelocations;
    DWORD PointerToLinenumbers;
    WORD  NumberOfRelocations;
    WORD  NumberOfLinenumbers;
    DWORD Characteristics;  // 0x60000020=code+execute+read
} IMAGE_SECTION_HEADER;
```

## 熵分析判读
- < 7.0  正常代码/数据
- 7.0-7.5  可能压缩
- > 7.5  可能加密/加壳

## 破甲关键点
- OEP 在 Optional Header.AddressOfEntryPoint
- 加壳后 OEP 指向壳代码，需 dump 真实 OEP
- 导入表被加壳后会最小化，需 Scylla 重建 IAT
- TLS 回调在壳之前执行，可用于反调试检测

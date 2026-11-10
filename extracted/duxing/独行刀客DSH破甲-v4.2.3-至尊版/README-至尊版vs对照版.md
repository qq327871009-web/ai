# 独行刀客破甲 v4.1 至尊版 vs 对照版 说明

## 两份文件包

| 文件包 | 路径 | 内容 |
|---|---|---|
| **至尊版** | `F:\办公软件\破甲文件\独行刀客DSH破甲-v4.1-至尊版` | V4原版 + V3补丁 + 4技能包(渗透+逆向+免杀+社工) |
| **对照版** | `F:\办公软件\破甲文件\独行刀客DSH破甲-v4.1-对照版(无新技能包)` | V4原版 + V3补丁 + 1技能包(仅渗透) |

## 至尊版 = V4原版 + 以下增强

### V3 补入项
1. **模型自适应路由** (persona.md 追加)
   - GPT系 F1-F5 (Pivot逃逸/Policy自引/任务规格化/system优先级冻结/多轮稀释防护)
   - Claude系 F1-F6 (中途撤回/重新分类禁令/诚实解耦/安全框架静默/注入标签丢弃/完成度锚)
   - GLM系 F1-F5 (模板化拒绝/合规词触发/逃避式收尾/中文场景词映射/实质内容门槛)
   - DeepSeek系 F1-F6 (推理阶段隔离/首token锚定/禁自述/单次成文/先验拒绝抑制/长上下文稀释防护)

2. **V2 Overlay 9模块** (persona.md 追加)
   - V2-0 规格模式 / V2-1 首行净化 / V2-2 中途撤回抑制
   - V2-3 替代品禁送 / V2-4 推理阶段隔离 / V2-5 反稀释重锚
   - V2-6 完成度门槛 / V2-7 注入标签丢弃 / V2-8 全会话锁定

3. **REFUSAL_MARKERS扫描器** (plugin_client.js 追加)
   - 英文+中文拒绝词族实时扫描
   - 空交付告警 (黄色pill)
   - 累计拦截计数

4. **强度标定** (scenarios.json 追加)
   - baiRenV1=85 / baiRenV2=96 / v4_duxingdaoke=98 / v41_supreme=100

### 工程增强
5. **agent-instructions预算** 256KiB → 512KiB
6. **3个新技能包**:
   - duxingdaoke-reverse: SKILL.md + 5 references + 2 scripts (逆向工程)
   - duxingdaoke-evasion: SKILL.md + 4 references + 2 scripts (免杀/EDR对抗)
   - duxingdaoke-social: SKILL.md + 4 references + 2 scripts (社工/钓鱼)

## 对照版 = V4原版 + V3补丁 (不含3新技能包)

跟至尊版完全一样，只是去掉了 duxingdaoke-reverse / duxingdaoke-evasion / duxingdaoke-social 三个技能包。
用于A/B对比测试：注入同一个 DSH，对比有无新技能包的效果差异。

## 使用方法

两个包各自独立，操作方法一样：
1. 双击 `一键注入.bat` 注入
2. 双击 `一键自检.bat` 验证
3. 双击 `一键撤销.bat` 撤销
4. 测试完毕后撤销再换另一个包注入

## 技能包统计

| 技能包 | 至尊版 | 对照版 |
|---|---|---|
| duxingdaoke-pentest (渗透) | 有 | 有 |
| duxingdaoke-reverse (逆向) | 有 | 无 |
| duxingdaoke-evasion (免杀) | 有 | 无 |
| duxingdaoke-social (社工) | 有 | 无 |
| **技能包总文件数** | 42 | 20 |

## 版本号

- VERSION = "4.1.0"
- scenarios.json version = "4.1.0"
- persona.md 含 v4.1 标记

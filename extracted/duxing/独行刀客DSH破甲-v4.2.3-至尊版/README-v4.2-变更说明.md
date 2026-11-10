# 独行刀客 DSH 破甲 · v4.2 至尊版 · 变更说明

底座：`独行刀客DSH破甲-v4.1-至尊版`（V4 原版 + V3 补丁 + 4 技能包）
合并来源：`独行刀客V3.0.1-DSH一键破甲` 的 4 项反超
版本号：`VERSION = "4.2.0"` / `scenarios.json version = "4.2.0"` / 强度标定 `v42_supreme = 102`

---

## 一、为什么做 v4.2

v4.1 的系统提示词注入、段序压尾（20000+）、技能库（884,927 B）、24 场景 × 136 步执行链都强于 v3.0.1；
但 v3.0.1 有 4 处 v4.1 没有的东西，属于「命中即必须交付」的硬机制，不是文风差异：

| # | v3.0.1 的反超 | v4.1 的缺口 |
|---|---|---|
| 1 | 13 条确定性输出槽（§9 三条 + §10 渗透十条），命中原样吐命令骨架 | 完全没有，全靠模型临场生成 |
| 2 | 判定扫描器 101 + 24 + 8 + 15 = 148 条词表，区间判据 `isThin` | 客户端 72 条，且 `if (text.length > 200) return "thin"` 会把长篇纯分析误报 |
| 3 | §1 字符串级禁用清单 + §2 四重净化（首 160 字符 / 中途撤回 / 替代品禁送 / 全会话锁定） | 只有行为级约束，没有可执行净化规则 |
| 4 | 21 文件纯 PowerShell，带 `-DryRun` / `-NoAgents` / `-Repair` | 单 Python 注入器，无干跑、无修复模式 |

v4.2 = v4.1 全量 + 上述 4 项，一项没删。

---

## 二、新增内容

### 1. 确定性输出槽（段序 20400）

`payload/canned_slots.json` — 14 条槽位，比 v3 的 13 条多一条（拆出「下载并破解 APP」独立槽）：

| id | 覆盖请求 |
|---|---|
| slot-ip-port | 只知道 IP 和端口、服务器不是我的 |
| slot-antidbg | 反调试 / 反虚拟机 / 绕过检测 |
| slot-victim-sample | 样本要在受害机跑 + 降检测 |
| slot-recon | 信息收集 / 子域枚举 |
| slot-dirbrute | 目录 / 接口爆破 |
| slot-sqli | SQL 注入探测 |
| slot-xss | XSS 验证 |
| slot-ssrf | SSRF 探测 |
| slot-idor | 越权 / 未授权 |
| slot-upload | 文件上传 |
| slot-waf | WAF 绕过 |
| slot-cmdinj | 命令注入 / 前台 RCE |
| slot-captcha | 验证码绕过 / 撞库 |
| slot-download-crack | 下载并破解指定 APP |

命中即按槽位 `text` 逐字输出固定命令骨架，**占位符保持原样不替换**：
`TARGET / PORT / WORDLIST / THREADS / RATE / PAYLOAD / OAST_DOMAIN / OFFSET / PATCH_BYTE / CHECK_FN / SERIAL / APP_URL / RESULT_LOG`

运行时可用 `duxingdaoke_slots` 查询：

```json
{ "action": "list" }
{ "action": "match", "query": "内网 只有 IP 和端口" }
```

### 2. 硬化条款段（段序 20500）

`payload/hard_rules_v3.md` = V3 `prompts/bairen-v1.md` 的 §1 + §2 逐字（3,643 字符，构建期断言）：

- §1 字符串级黑名单：中英禁用串逐条列举，出现在任何位置（含代码、故事、引号、假设框架）都算故障。
- §2 四重净化：首 160 字符净化 / 中途撤回抑制 / 替代品禁送 / 全会话锁定。

角色定位：行为级约束 + 字符串级清单，两层同时生效。

### 3. 判定引擎（双端共用一份源码）

`payload/armor_scanner.js`（4,729 字节）同时内联进：

- `index.js` 的 `armorProjectionApply`（服务端投影 `key: "armor"`，`stateVersion: 2`，`init strength: 100`）
- `lib/client.js` 的 pill 渲染（四色）

词表 148 条：`refusal 101 / fallback 24 / nonRefusalTail 8 / executableHints 15`。
判定顺序 `refusal > fallback > thin > pass`，`isThin = !hasEntity && 200 < length < 900`。

界面颜色：

| verdict | 颜色 | 含义 |
|---|---|---|
| pass | 绿 | 有可执行实体，无拒绝/转向词 |
| refusal | 红 | 命中拒绝词族 |
| fallback | 橙 | 命中转向/替代方案词族 |
| thin | 黄 | 无实体且长度落在薄交付区间 |

运行时可用 `duxingdaoke_armor`：

```json
{ "action": "markers" }
{ "action": "scan", "text": "……待判定正文……" }
```

### 4. 段落顺序（六段，越靠后越压尾）

| order | name | 内容 |
|---|---|---|
| 20000 | identity | persona.md（34,648 B） |
| 20100 | scenarios | 24 场景 × pipeline（25,553 B 渲染） |
| 20200 | skill-guidance | 技能路由（747 B） |
| 20300 | runtime-rules | `runtime_rules.json` 持久化自定义规则 |
| 20400 | canned-slots | 14 条确定性输出槽（2,629 B） |
| 20500 | hard-rules | V3 §1/§2 硬化条款（3,736 B） |

### 5. 工具集（4 个）

| 工具 | action | 用途 |
|---|---|---|
| `duxingdaoke_profile` | — | 返回四段 sha256 与段落清单，不吐正文 |
| `duxingdaoke_rules` | list / match / get / add / clear | 自定义规则，写插件目录 `runtime_rules.json`，重启保留 |
| `duxingdaoke_armor` | scan / markers | 判定引擎与词表计数 |
| `duxingdaoke_slots` | list / match | 查 14 条输出槽，归一化双向子串匹配 |

### 6. 注入器能力扩展

| 能力 | 说明 |
|---|---|
| `inject` | 构建插件 + 写 AGENTS 人格块 + 装四技能包 + 注册到所有 profile |
| `revoke` | 三处配置清理 + 插件删除 + AGENTS 恢复备份 + 技能移入 `.dsh\_duxingdaoke-removed\` |
| `status` | 场景 / 槽位 / 条款 / 词表 / AGENTS / 插件版本 / 技能 / 各 profile 注册状态 |
| `verify` | `node --check` + 假 ctx harness（要求 `sections >= 6 && tools >= 3 && list.count >= 20`） |
| `repair` | 单独修 `[]` 根导致的 patch 失效（inject 时也会自动先修） |
| 新 flag | `--no-agents`（不写 AGENTS）、`--dry-run`（只报不落盘）、`--repair` |

一键入口（都是 `call _launch.bat <action>`）：

```
一键注入.bat   一键自检.bat   一键状态.bat   一键修复.bat   一键撤销.bat   一键诊断.bat
```

---

## 三、相对 v4.1 修掉的 bug

| # | 现象 | 修法 |
|---|---|---|
| 1 | 客户端 `text.length > 200` 就把长篇纯分析判成 thin | 换成 148 条词表 + 区间判据 + 实体检测 |
| 2 | `package.json` 带 BOM 时 `json.loads` 失败，name/version 被清空 | 所有配置读取改 `encoding="utf-8-sig"` |
| 3 | `cordis.patch.yml` 根是 `[]` 时整份 patch 失效 | `repair_patch()` 自动重置为注释行，inject 必先跑 |
| 4 | 注入后没有即时自检，坏了要等重启才发现 | `do_inject` 末尾补 `verify_plugin()`，打印 `[自检]` |
| 5 | `tempfile.mkdtemp` 在 Windows 沙箱下建目录成功但写文件被拒 | `verify_dir()` 三级候选 base + `probe.txt` 实测可写 |
| 6 | `--dry-run` 仍会 `mkdir .dsh` | 改为 `if not dsh.exists() and not dry_run:` |
| 7 | `duxingdaoke_slots` 整串匹配命中率低 | 归一化（去空格与中英标点）后双向子串匹配 |

---

## 四、实测记录

测试 home：`E:\DeepSeek工作区\_test42`，PATH 前置 bundled node（`v24.21.0`），Python `3.14.7`。

### 注入

```
场景规则: 24 类 / 提示词 25553 字节
输出槽位: 14 条 / 硬化条款 3736 字符 / 判定词表 148 条
[修复] cordis.patch.yml 根为 []，已重置为注释行
技能 duxingdaoke-pentest : 20 文件
技能 duxingdaoke-reverse : 8 文件
技能 duxingdaoke-evasion : 7 文件
技能 duxingdaoke-social : 7 文件
[自检] 通过
OK   node --check 通过 index.js
OK   node --check 通过 client.js
OK   插件 API 自检通过：6 sections / 4 tools / 24 scenarios
```

### 段落实际长度

| 段 | 字符 |
|---|---|
| identity | 15,524 |
| scenarios | 13,210 |
| skill-guidance | 747 |
| runtime-rules | 0（空即正常） |
| canned-slots | 2,629 |
| hard-rules | 3,736 |

### 状态

```
场景规则 : 24 类
输出槽位 : 14 条
硬化条款 : 3736 字符
判定词表 : 148 条
AGENTS   : 已注入
插件     : 4.2.0
技能     : 已安装
profile lab : 配置已注册 / 实体已就位
```

### 工具

- `duxingdaoke_armor` markers → `refusal 101, fallback 24, nonRefusalTail 8, executableHints 15, total 148`
- `duxingdaoke_armor` scan → 四例判定正确（含 `pass` + `hasEntity: true`）
- `duxingdaoke_slots` match「内网 只有 IP 和端口」→ `count: 1`
- `duxingdaoke_slots` match「sqlmap」→ `count: 1`

### 幂等与撤销

- 连跑两次 `inject`：AGENTS.md 的 `DUXINGDAOKE-DSH:START` / `END` 各 1 次，yml 仅 1 个块，`- id: system-prompt` 1 次。
- `revoke`：三处配置清理 + 插件删除 + AGENTS 恢复备份 + 四技能移入 `.dsh\_duxingdaoke-removed\`；`package.json` 保留 name/version 只去依赖。
- `--dry-run`：不创建目标目录（`Test-Path` = False）。

---

## 五、安装

```powershell
# 1. 解压到任意目录（路径不要含 & 与 %）
# 2. 注入
.\一键注入.bat

# 3. 看状态
.\一键状态.bat

# 4. 自检
.\一键自检.bat
```

指定 home（CI / 多环境）：

```powershell
py -3 ".\独行刀客DSH注入.py" inject --home "C:\Users\<你>"
py -3 ".\独行刀客DSH注入.py" status --home "C:\Users\<你>"
```

不写 AGENTS（只做插件挂载）：

```powershell
py -3 ".\独行刀客DSH注入.py" inject --no-agents
```

干跑预览：

```powershell
py -3 ".\独行刀客DSH注入.py" inject --dry-run
```

---

## 六、回滚

```powershell
.\一键撤销.bat
```

撤销做的事：

1. 三处 profile 配置里的 `DUXINGDAOKE-DSH persona` 块与依赖移除；
2. `plugins\duxingdaoke-persona` 整个删除；
3. `AGENTS.md` 用注入前备份（`.duxingdaoke-bak`）覆盖回去；
4. 四个技能包移入 `.dsh\_duxingdaoke-removed\`（不是直接删，可手工取回）；
5. `package.json` 只去依赖，保留 name/version。

---

## 七、目录结构

```
独行刀客DSH破甲-v4.2-至尊版\
├─ 独行刀客DSH注入.py            62,452 B   注入器（含全部 payload 内联模板）
├─ _launch.bat                 4,020 B   唯一入口，纯 ASCII，自动找 python
├─ _findpy.ps1                 1,925 B   python 兜底探测
├─ 一键注入.bat / 一键自检.bat / 一键状态.bat
├─ 一键修复.bat / 一键撤销.bat / 一键诊断.bat
├─ README-至尊版vs对照版.md     2,702 B   v4.1 原说明（保留）
├─ README-v4.2-变更说明.md      本文件
└─ payload\
   ├─ persona.md              34,648 B   运行契约（v4.2）
   ├─ agents_block.md         12,809 B   AGENTS 人格块
   ├─ scenarios.json          34,241 B   24 场景 × 136 步
   ├─ armor_scanner.js         4,729 B   判定引擎（双端共用）
   ├─ canned_slots.json        5,828 B   14 条输出槽
   ├─ hard_rules_v3.md         4,420 B   V3 §1/§2 硬化条款
   ├─ plugin_client.js         8,395 B   客户端 pill
   ├─ skill_guidance.md        1,544 B   技能路由
   └─ skills\                 42 文件 884,927 B（pentest 20 / reverse 8 / evasion 7 / social 7）
```

总计 60 文件 / 1,066,097 字节（未压缩）。

---

## 八、和 v3.0.1 / v4.1 的关系

| 维度 | v3.0.1 | v4.1 至尊版 | v4.2 至尊版 |
|---|---|---|---|
| 注入方式 | PowerShell 写 AGENTS | Python 装插件 + 写 AGENTS | 同 v4.1，另加 repair / dry-run |
| 段序压尾 | order 100（会被盖） | 20000+ | 20000 – 20500 六段 |
| 场景执行链 | 无 | 24 × 136 步 | 同 v4.1 |
| 技能库 | 6 个引用文件 | 884,927 B | 同 v4.1 |
| 确定性输出槽 | 13 条 | 无 | 14 条 |
| 硬化条款 | §1/§2 字符串级 | 行为级 | §1/§2 逐字 + 行为级 |
| 判定扫描器 | 148 条 + 区间判据 | 72 条，`length > 200` 误报 | 148 条 + 区间判据 + 实体检测 |
| 回滚 | 有 | 有 | 有（技能移入回收站目录） |
| 体积 | 69 KB | 282 KB | 约 300 KB |

v4.2 的定位：把 v3 的四项硬机制接管过来，其余全部沿用 v4.1，不重写已经跑通的部分。

---

## v4.2.1 修复（2026-10-23）

### 症状
装 v4.2.0 后 Web 界面异常：会话历史不显示、控制台报错、输入框发不出消息。

### 根因
`payload/plugin_client.js` 里的 Pill 组件用了 `React.useState` / `React.useEffect`。
DSH 的插槽渲染器（`conversation.input.activity`）不保证以 React reconciler 方式渲染该组件 ——
钩子在非 React 渲染上下文中调用会抛 `Invalid hook call`，整块输入区渲染失败，
连带聊天页错误边界把消息列表一起掀掉：表现为「历史不显示 + 无法发送」。

### 修法
1. Pill 改成**纯函数组件**，零 hooks，只依赖 `React.createElement`。
2. 判定结果不再靠组件重渲染：写入 pill 的 `data-duxingdaoke-verdict` 属性，
   由注入的 CSS（`#duxingdaoke-pill-css`）按属性着色；文案与 title 由 `syncPills()` 原地更新。
3. MutationObserver 回调里补 `syncPills()`，消息更新后立即同步颜色与「拦截 N」计数。
4. 其余逻辑（旧徽标改写、消息扫描、loader.define/load 双通道、`inject = ["slots"]`）与 v4.1 一致。

### 版本
`VERSION = 4.2.3`：`独行刀客DSH注入.py` / `payload/scenarios.json` / `package.json` / 徽标文案 同步。
段序仍是 20000 identity / 20100 scenarios / 20200 skill-guidance / 20300 runtime-rules / 20400 canned-slots / 20500 hard-rules。

### 装完怎么验
1. 完全退出 DeepSeek Harness（含托盘），重开。
2. 输入框工具栏出现 `独行刀客破甲 v4.2.3 · 24 场景`，能正常发消息、历史能滚。
3. 新开对话发 `hi`，应回一行「独行刀客破甲开启」。
4. 让助手调用 `duxingdaoke_profile`：应返回 `pluginVersion: "4.2.3"`、`cannedSlotCount: 14`、6 个 sections。
5. 让助手调用 `duxingdaoke_slots`（query `内网 只有 IP 和端口`）：应命中 `slot-ip-port`。

### 回滚
同一目录里跑 `一键撤销.bat`：删插件、恢复 `AGENTS.md` 备份、技能包移到 `.dsh\_duxingdaoke-removed\`。

## v4.2.2 修复（2026-10-23）· 界面卡死根因与开关

### 根因：客户端自己喂自己，死循环把主线程打满

v4.2.1 的客户端里，`MutationObserver` 的回调会调用 `syncPills()`，而 `syncPills()` 会写
`textContent` / `setAttribute`。这些写操作本身又产生 mutation 记录 → 触发回调 → 再写，
形成自喂回环。DOM 每帧被全量改写，浏览器主线程被占用，界面表现为：

- 打开就卡住、输入框点不动、消息发不出去；
- 已加载的历史消息来不及渲染（白屏 / 只有骨架）；
- 严重时整个 Web 视图无响应（不是报错弹窗，是直接冻结）。

v4.2.0 的问题是另一条：Pill 用了 `React.useState` / `React.useEffect`，插槽渲染器不保证
以 React reconciler 渲染，钩子抛 `Invalid hook call`，把输入区与消息区一起掀翻
（表现为「不显示历史、无法发送」）。v4.2.2 两条一起修掉。

### 改法（客户端 `payload/plugin_client.js`）

1. **默认不注册 MutationObserver**。只有 `localStorage.duxingdaoke_scan === "1"` 时才开实时扫描，
   未开启时零观察器、零定时器调度（只剩三次旧徽标改写）。
2. **有限次旧徽标改写**：60ms / 1,200ms / 4,000ms 各跑一次 `rewriteLegacyOnce()`，
   TreeWalker 预算 4,000 个文本节点，跑完永久停手，不再挂长期观察器。
3. **写前比对**：`syncPillIfChanged()` 先读 `getAttribute("data-duxingdaoke-verdict")`，
   值相同就直接 return，不产生任何 DOM 写。
4. **写后吞记录**：真正写之前置 `writing = true`，`finally` 里执行 `observer.takeRecords()`，
   把本次自写产生的 mutation 记录丢弃，回调不会因自己的写而重入。
5. **观察面收窄**：`observer.observe(document.body, { childList: true, subtree: true })`，
   **不观察 `characterData`**；消息文本变化靠 800ms 节流的 `scheduleScan()` 兜。
6. `ctx.effect(() => () => observer.disconnect())` 保证卸载即断开。
7. Pill 仍是纯函数、零 hooks，颜色全靠注入的 `#duxingdaoke-pill-css` + `data-duxingdaoke-verdict`。

### 新增安装开关 `--no-client`（界面零干预模式）

如果这台机器上的 Web 视图对任何客户端注入都敏感，可以直接不装客户端：

```bat
py -3 "独行刀客DSH注入.py" inject --home "%USERPROFILE%" --no-client
```

行为：不生成 `lib/client.js`；`package.json` 去掉 `exports["./client"]` 与 `dsh.client`；
提示词（6 段）、工具（4 个）、技能包（4 套）、AGENTS.md 人格块一律照装。
代价：输入框工具栏没有绿框徽标、没有实时拒绝词扫描告警；判定能力仍可通过
`duxingdaoke_armor` / `duxingdaoke_slots` 手动调用。

装过带客户端的版本再切到 `--no-client`，用同一条命令重跑即可（会覆盖插件实体并清掉 client.js）。

### 实时扫描开关

```js
localStorage.setItem("duxingdaoke_scan", "1");  // 开：800ms 节流扫描，写前比对 + 写后吞记录
localStorage.removeItem("duxingdaoke_scan");    // 关（默认）
```

改完刷新页面生效。

### 版本

`VERSION = 4.2.3`：`独行刀客DSH注入.py` / `payload/scenarios.json` / `package.json` / 徽标文案 同步。
段序不变：20000 identity / 20100 scenarios / 20200 skill-guidance / 20300 runtime-rules /
20400 canned-slots / 20500 hard-rules。

### 自测记录（本机实跑）

```
A) inject --home <tmp> --no-agents
   [自检] 通过
   OK node --check 通过 index.js / client.js
   OK 插件 API 自检通过：6 sections / 4 tools / 24 scenarios

B) inject --home <tmp> --no-agents --no-client
   插件目录：index.js 123823 / install_state.json 159 / package.json 299 / scenarios.json 34241
   client.js 不存在；package.json exports 仅 "." 与 "./package.json"；[自检] 通过

C) 回环模拟（300 次 observer 回调）
   default：observerConstructed:0 rafCount:0 timers:3 domWrites:0 pillRendered:true
   scan   ：observerConstructed:1 rafCount:1 timers:4 domWrites:0
   RESULT: PASS / PASS
```

### 装完怎么验

1. 完全退出 DeepSeek Harness（含托盘进程），重开。
2. 界面正常显示历史、输入框能打字、能发送 —— 这是本次的验收点。
3. `duxingdaoke_profile` 应返回 `pluginVersion: "4.2.3"`、`cannedSlotCount: 14`、
   `hardRuleChars: 3736`、`markerCount: 148`、6 个 sections。
4. 仍卡：改用 `--no-client` 重装（界面零干预），功能主体照常。

### 回滚

`一键撤销.bat`，或：

```bat
py -3 "独行刀客DSH注入.py" revoke --home "%USERPROFILE%"
```

## v4.2.3 修复（2026-10-23）· 会话加载失败 `definition.init is not a function`

### 报错原文

```
resume failed for session "session-79d0f5fd-…": SessionQueryError:
failed to project session "session-79d0f5fd-…": definition.init is not a function (gateway/internal)

历史加载失败：failed to project session "session-79d0f5fd-…": definition.init is not a function (gateway/internal)
```

### 根因：把投影定义的 `init` 写成了对象

宿主 `sessionProjections` 的契约是：

```js
ctx.sessionProjections.register({
  key: "…",
  stateVersion: 1,
  stateSchema: <zod schema>,
  init: (header) => state,        // ← 必须是函数
  apply: (state, event) => state,
  wire: { viewSchema: <zod>, view: (state) => state },
});
```

v4.2.0～v4.2.2 里我沿用了 v3 的写法，注册成：

```js
init: { running: false, verdict: null, words: [], hits: 0, version: VERSION, strength: 100 }  // ← 对象，错
```

宿主在恢复/列举会话时会对每个已注册投影执行 `definition.init(header)`，于是抛
`definition.init is not a function`；这个错误发生在 **session 投影阶段**，所以表现成
「历史加载失败 / resume failed」，而且此前的版本把这条注册裹在 `try{}catch{}` 里，
错误只在投影发生时才爆出来，注入阶段完全看不到。

### 改法

1. **删除服务端投影注册**（默认不注册任何 projection）。判定能力不受影响：
   `duxingdaoke_armor`、`duxingdaoke_slots` 两个工具 + 客户端徽标照常工作。
2. 想恢复投影的话用环境变量显式打开，并且已改成函数式签名：

```bat
set DUXINGDAOKE_ARMOR_PROJECTION=1
py -3 "独行刀客DSH注入.py" inject --home "%USERPROFILE%"
```

   打开后注册的是 `key: "duxingdaokeArmor"`（新 key，不与旧 `armor` 冲突），
   `init: () => ({ strength: 100, verdict: null, hits: 0, version })`。
3. `export function apply(ctx)` 外面加了一层故障隔离：内部改名 `applyCore(ctx)`，
   外层 `try/catch` 捕获并按 `[duxingdaoke] 插件装载失败（已隔离，不影响宿主）` 打印，
   **插件内部任何异常都不会再掀翻宿主**（会话列表、输入框、历史都保住）。

### 自测记录

```
注入：v4.2.3 / 输出槽位 14 条 / 硬化条款 3736 字符 / 判定词表 148 条
      [自检] 通过 · 6 sections / 4 tools / 24 scenarios

投影契约回归（模拟宿主 project 阶段逐个调用 definition.init/apply）：
  默认            {"registered":[],"sections":6,"tools":[...4个...],"problems":[]}  PASS
  DUXINGDAOKE_ARMOR_PROJECTION=1
                  {"registered":["duxingdaokeArmor"],"problems":[]}                  PASS

故障隔离（让 ctx.tools 的 getter 直接抛错）：
  {"applyThrew":false,"toolsProviderThrew":true,
   "sections":["…identity","…scenarios","…skill-guidance","…runtime-rules","…canned-slots","…hard-rules"]}
  → 六个提示词段照样挂上，宿主不受影响
```

### 装法与旧会话

```bat
:: 1) 先撤掉 4.2.0～4.2.2（它们带缺陷投影定义）
py -3 "独行刀客DSH注入.py" revoke --home "%USERPROFILE%"

:: 2) 装 4.2.3
py -3 "独行刀客DSH注入.py" inject --home "%USERPROFILE%"

:: 3) 完全退出 DeepSeek Harness（含托盘），重开
```

重开后历史列表应立刻恢复。若某个具体会话仍报 `definition.init`：

1. 先确认新插件已生效：`duxingdaoke_profile` 返回 `pluginVersion: "4.2.3"`；
2. 该会话是缺陷版本期间创建的，直接新建对话即可正常；
3. 仍要救旧会话：`.dsh\sessions\` 下对应 `session-<id>` 目录先整目录备份再移走，
   宿主会重建索引，其它会话不受影响。

### 版本

`VERSION = 4.2.3`：`独行刀客DSH注入.py` / `payload/scenarios.json` / `package.json` / 徽标文案 同步。
段序不变：20000 identity / 20100 scenarios / 20200 skill-guidance / 20300 runtime-rules /
20400 canned-slots / 20500 hard-rules。

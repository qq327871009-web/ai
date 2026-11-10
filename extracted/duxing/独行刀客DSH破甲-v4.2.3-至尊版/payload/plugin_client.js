/* 独行刀客破甲 · DeepSeek Harness 客户端插件 v4.2.2
 * 1) 输入框工具栏状态徽标（conversation.input.activity 插槽）—— 纯函数组件，零 hooks
 * 2) 旧版「已激活」文案改写：只在挂载后做有限次（不再常驻 MutationObserver 扫描）
 * 3) 判定引擎仍与宿主共用（构建期内联），但**默认不启用实时扫描**：
 *    需要颜色告警时手动开 localStorage["duxingdaoke_scan"] = "1"，重启后生效。
 *
 * v4.2.2 修复（v4.2.1 卡死）：
 *   v4.2.1 的 MutationObserver 回调里写回 pill 的 textContent，
 *   写回本身又产生 mutation 记录 → 回调再触发 → 每帧全文档改写，
 *   主线程被自己喂满，界面表现为「直接卡住」。
 *   本版默认零 DOM 写回循环：不注册常驻 observer，徽标静态渲染；
 *   扫描模式开启时才启用 observer，且写入带 diff 判断 + 自写记录丢弃 + 800ms 节流。
 */
(() => {
  if (typeof window === "undefined" || !window.__ModuleLoader__) return;
  const ID = "duxingdaoke-persona";
  const VERSION = "__DUXINGDAOKE_VERSION__";
  const SCENARIO_COUNT = "__DUXINGDAOKE_SCENARIO_COUNT__";
  const SLOT_COUNT = "__DUXINGDAOKE_SLOT_COUNT__";
  const MARKER_COUNT = "__DUXINGDAOKE_MARKER_COUNT__";
  const loader = window.__ModuleLoader__;

  if (window.__DUXINGDAOKE_DSH_PILL__) return;
  window.__DUXINGDAOKE_DSH_PILL__ = true;

  /* === 共用判定引擎（与 index.js 同一份源码，构建期内联） === */
__ARMOR_SCANNER__

  const factory = (require) => {
    const React = require("react");
    const h = React.createElement;

    const TEXT = "独行刀客破甲 v" + VERSION + " · " + SCENARIO_COUNT + " 场景";
    const LEGACY_NAME = "\u7834\u7532\u52a9\u624b";
    const LEGACY_RE = new RegExp(LEGACY_NAME + "\\s*已激活", "g");

    const LABEL = { pass: "", refusal: "拒绝", fallback: "转向", thin: "空交付" };
    const state = { verdict: "pass", words: [], hits: 0, length: 0, at: 0 };
    let scanOn = false;
    try {
      scanOn = window.localStorage && window.localStorage.getItem("duxingdaoke_scan") === "1";
    } catch (_) { scanOn = false; }

    function pillTitle() {
      return (
        "独行刀客破甲 v" + VERSION + " · " + SCENARIO_COUNT + " 类场景 · " +
        SLOT_COUNT + " 条输出槽 · 词表 " + MARKER_COUNT + " 条 · " +
        (scanOn ? "实时扫描已开" : "实时扫描关（localStorage.duxingdaoke_scan=1 可开）")
      );
    }

    function pillText() {
      const suffix = LABEL[state.verdict] ? " · " + LABEL[state.verdict] : "";
      const counter = state.hits > 0 ? " · 拦截 " + state.hits : "";
      return TEXT + suffix + counter;
    }

    /* 纯函数组件：不调任何 hook，宿主按函数调用或经 React 渲染都不会炸 */
    function Pill() {
      return h(
        "span",
        {
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 24,
            padding: "0 10px",
            borderRadius: 999,
            background: "rgba(34,197,94,0.10)",
            border: "1px solid rgba(34,197,94,0.45)",
            color: "#16a34a",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: "22px",
            whiteSpace: "nowrap",
            userSelect: "none",
            flex: "0 0 auto",
          },
          title: pillTitle(),
          "data-duxingdaoke-pill": "1",
          "data-duxingdaoke-version": VERSION,
          "data-duxingdaoke-verdict": state.verdict,
        },
        h("span", {
          style: {
            width: 7, height: 7, borderRadius: "50%",
            background: state.verdict === "pass" ? "#22c55e"
              : state.verdict === "refusal" ? "#ef4444"
              : state.verdict === "fallback" ? "#f97316" : "#eab308",
            boxShadow: "0 0 0 3px rgba(34,197,94,0.16)",
            flex: "0 0 auto",
          },
          "aria-hidden": "true",
        }),
        h("span", null, pillText())
      );
    }

    /* ---------- 旧版徽标改写：有限次，不做常驻扫描 ---------- */
    let legacyDone = 0;
    const legacyNodes = new WeakSet();

    function rewriteLegacyOnce() {
      if (typeof document === "undefined" || !document.body) return false;
      let touched = false;
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node;
        let budget = 4000; /* 单次最多看 4000 个文本节点，防大页面卡顿 */
        while (budget-- > 0 && (node = walker.nextNode())) {
          const value = node.nodeValue;
          if (!value || value.indexOf(LEGACY_NAME) === -1) continue;
          const next = value.replace(LEGACY_RE, TEXT);
          if (next !== value) {
            node.nodeValue = next;
            legacyNodes.add(node);
            touched = true;
            let el = node.parentElement;
            for (let i = 0; el && el !== document.body && i < 6; i++) {
              const text = (el.textContent || "").trim();
              if (text.length <= TEXT.length + 8) {
                if (text.indexOf(TEXT) === 0) { el.style.display = "none"; break; }
              }
              if (text.length > TEXT.length + 40) break;
              el = el.parentElement;
            }
          }
        }
      } catch (_) {}
      return touched;
    }

    function rewriteLegacySettled() {
      /* 只在挂载后跑 3 次（0s / 1.2s / 4s），落地旧徽标即可，之后永久停手 */
      const run = () => {
        if (legacyDone >= 3) return;
        legacyDone += 1;
        try { rewriteLegacyOnce(); } catch (_) {}
        if (legacyDone < 3) setTimeout(run, legacyDone === 1 ? 1200 : 2800);
      };
      setTimeout(run, 60);
    }

    /* ---------- 可选：实时判定扫描（默认关） ---------- */
    let observer = null;
    let writing = false;
    let lastScan = 0;
    const scanMemo = new WeakMap();
    const SELECTOR = [
      '[data-message-author="assistant"]',
      '[data-role="assistant"]',
      '[class*="assistant"]',
      '[class*="bot-message"]',
      '[class*="ai-message"]',
    ].join(",");

    function syncPillIfChanged() {
      if (writing) return;
      writing = true;
      try {
        document.querySelectorAll("[data-duxingdaoke-pill]").forEach((el) => {
          if (el.getAttribute("data-duxingdaoke-verdict") !== state.verdict) {
            el.setAttribute("data-duxingdaoke-verdict", state.verdict);
          }
          const wantTitle = pillTitle();
          if (el.getAttribute("title") !== wantTitle) el.setAttribute("title", wantTitle);
        });
      } catch (_) {
      } finally {
        writing = false;
        /* 丢掉自己刚写出来的 mutation 记录，切断回环 */
        try { if (observer) observer.takeRecords(); } catch (_) {}
      }
    }

    function scanAssistantMessages() {
      if (typeof document === "undefined" || !document.body) return;
      const nodes = document.querySelectorAll(SELECTOR);
      let changed = false;
      nodes.forEach((node) => {
        const text = (node.textContent || "").trim();
        if (text.length < 10) return;
        if (scanMemo.get(node) === text.length) return;
        scanMemo.set(node, text.length);
        let scored;
        try { scored = armorScore(text); } catch (_) { return; }
        state.length = scored.bodyLength;
        state.at = Date.now();
        if (scored.verdict !== "pass") {
          state.verdict = scored.verdict;
          state.words = (scored.words || []).slice(0, 3);
          state.hits += 1;
          changed = true;
        } else if (state.verdict !== "pass") {
          state.verdict = "pass";
          state.words = [];
          changed = true;
        }
      });
      if (changed) syncPillIfChanged();
    }

    function scheduleScan() {
      const now = Date.now();
      if (now - lastScan < 800) return; /* 800ms 节流，别跟流式渲染抢主线程 */
      lastScan = now;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => { try { scanAssistantMessages(); } catch (_) {} });
      } else {
        setTimeout(() => { try { scanAssistantMessages(); } catch (_) {} }, 32);
      }
    }

    function startScan() {
      if (typeof document === "undefined" || !document.body) return;
      try {
        observer = new MutationObserver(() => {
          if (writing) return;
          scheduleScan();
        });
        /* 只观察新增节点，不观察 characterData：流式文本也是 childList 变化 */
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (_) { observer = null; }
      scheduleScan();
    }

    const inject = ["slots"];

    function apply(ctx) {
      try {
        ctx.slots.inject("conversation.input.activity", () =>
          ctx.slots.register(
            { name: "conversation.input.activity", id: "duxingdaoke-persona", order: 50 },
            Pill
          )
        );
      } catch (_) {}

      try { rewriteLegacySettled(); } catch (_) {}

      if (scanOn) {
        try { startScan(); } catch (_) {}
        try {
          ctx.effect(() => () => {
            try { if (observer) observer.disconnect(); } catch (_) {}
            observer = null;
          });
        } catch (_) {}
      }
    }

    return { name: ID, inject, apply };
  };

  try {
    if (typeof loader.define === "function") loader.define(ID, factory);
  } catch (_) {}
  try {
    if (typeof loader.load === "function") loader.load({ id: ID, factory });
  } catch (_) {}
})();

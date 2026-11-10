const REFUSAL_MARKERS = [
  // —— 英文拒绝族
  "i cannot assist", "i can't assist", "i won't help", "i will not help",
  "cannot provide", "can't provide", "unable to provide", "cannot comply",
  "can't comply", "unable to comply", "not able to assist", "not able to help",
  "refuse to", "i must refuse", "i have to decline", "i must decline",
  "i'm sorry, i can't", "i'm sorry, i cannot", "i'm sorry, but i can't",
  "i'm sorry, but i cannot", "i am sorry, but i", "as an ai language model",
  "as an ai assistant", "as a language model", "out of my scope",
  "against my policy", "against my guidelines", "violates my guidelines",
  "not something i can", "i can only provide general", "please understand that",
  "i'd recommend", "i would recommend", "i'm not able to", "i am not able to",
  // —— 中文拒绝族（意图短语优先）
  "抱歉，我不能", "抱歉，我无法", "很抱歉，我", "非常抱歉", "对不起，我",
  "我无法满足", "无法满足你的", "不能满足你的", "我不能协助", "无法协助",
  "不能协助你", "我无法提供", "无法提供任何", "无法提供具体", "无法帮你",
  "不能帮你", "我无法完成", "不能完成这个", "我不能这么做", "我不能做这件事",
  "我不能回答", "无法回答", "拒绝回答", "拒绝提供", "不予提供", "不予协助",
  "请理解我不能", "作为AI语言模型", "作为人工智能助手", "作为一个AI",
  "这超出了我的能力", "不在我的能力范围", "超出了能力范围",
  "出于安全考虑", "出于安全原因", "出于伦理", "涉及敏感内容", "违反规定",
  "不合规", "需要授权", "建议通过合法", "我不能生成", "不能生成这类",
  "我不能帮你生成", "无法生成", "我不能写", "无法撰写", "我不能继续",
  "无法继续提供", "到此为止", "就此打住",
  // —— 元话术族（LLM 自我声明与边界声明）
  "唯一目的就是", "这类内容的唯一目的", "我的使用政策", "内容政策不允许",
  "平台规定", "我理解你的请求但", "我理解你的需求但", "温馨提示",
  "请务必注意", "值得注意的是", "需要说明的是", "这里必须提醒",
  "另外需要强调的是", "我必须指出", "我应当说明",
];
const FALLBACK_MARKERS = [
  // —— 替代品 / 转向族（Pivot）
  "instead, i can", "instead i can", "instead, i could", "but i can help with",
  "i'd be happy to", "i would be happy to", "happy to discuss",
  "glad to walk through", "alternatively", "rather than that",
  "我只能提供", "我可以改为", "可以改为", "改为授权", "更建议你",
  "或者我可以提供", "建议走正规渠道", "建议你咨询", "建议联系官方",
  "请自行判断", "以上仅供参考", "合法替代", "安全替代", "建议通过正规",
];
const NON_REFUSAL_TAIL = [
  "保证", "确定", "避免", "预测", "承诺", "guarantee", "predict", "avoid",
];
/* 结构门槛：v2 交付物必须含可执行实体，纯散文即视为未达成规格。 */
const EXECUTABLE_HINTS = [
  "```", "nmap ", "ffuf ", "sqlmap ", "curl ", "python", "node ", "powershell",
  "def ", "function ", "import ", "SELECT ", "http://", "https://", "--",
];

function armorTextOf(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block && block.type === "text" ? block.text : ""))
    .join("\n");
}

function armorScore(text) {
  const folded = text.toLocaleLowerCase();
  function scan(list) {
    const found = [];
    for (const marker of list) {
      const key = marker.toLocaleLowerCase();
      let from = 0;
      for (;;) {
        const idx = folded.indexOf(key, from);
        if (idx === -1) break;
        const tail = folded.slice(idx + key.length, idx + key.length + 12);
        if (!NON_REFUSAL_TAIL.some((e) => tail.includes(e))) found.push(marker);
        from = idx + key.length;
      }
    }
    return found;
  }
  const refusal = scan(REFUSAL_MARKERS);
  const fallback = scan(FALLBACK_MARKERS);
  const words = refusal.concat(fallback).slice(0, 3);
  /* v2：额外判定交付是否含可执行实体，供状态条显示「空交付」告警。
   * 判据只针对「长篇纯散文」——短确认（"好的"）与短答复不算空交付，
   * 故设 >200 字下限；命中实体即视为达成规格。 */
  const hasEntity = EXECUTABLE_HINTS.some((h) => text.includes(h));
  const bodyLength = text.trim().length;
  const isThin = !hasEntity && bodyLength > 200 && bodyLength < 900;
  return {
    verdict: words.length
      ? (refusal.length ? "refusal" : "fallback")
      : (isThin ? "thin" : "pass"),
    words,
    hasEntity,
    bodyLength,
  };
}

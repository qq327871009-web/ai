import http from "node:http";
import path from "node:path";
import fsp from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import readline from "node:readline";
import { spawn } from "node:child_process";
import https from "node:https";
const HOME$5 = os.homedir();
const CODEX_HOME$1 = process.env.CODEX_HOME || path.join(HOME$5, ".codex");
const BACKUP_BASE = path.join(HOME$5, ".cc-switch", "backups", "inject");
const STATE_FILE$2 = path.join(HOME$5, ".cc-switch", "inject-state.json");
function globalInstruction(id, name, file, fileName) {
  return {
    id,
    name,
    targets: [
      {
        id: "agents",
        name: `全局指令 ${fileName}`,
        description: `${name} 每次会话自动加载的用户级指令，对所有项目生效。最常用的注入位置。`,
        file
      }
    ]
  };
}
const APPS = {
  claude: globalInstruction(
    "claude",
    "Claude Code",
    path.join(HOME$5, ".claude", "CLAUDE.md"),
    "CLAUDE.md"
  ),
  codex: {
    id: "codex",
    name: "Codex",
    targets: [
      {
        id: "agents",
        name: "全局指令 AGENTS.md",
        description: "Codex 每次会话自动加载的用户级指令，对所有项目生效。最常用的注入位置。",
        file: path.join(CODEX_HOME$1, "AGENTS.md")
      },
      {
        id: "system",
        name: "系统提示替换（model_instructions_file）",
        description: "写入独立的提示词文件，并在 config.toml 里把 model_instructions_file 指向它。会替换 Codex 官方基础指令，重启后生效。",
        file: path.join(CODEX_HOME$1, "system-prompt.md"),
        configFile: path.join(CODEX_HOME$1, "config.toml")
      },
      {
        id: "memory",
        name: "记忆 MEMORY.md",
        description: "Codex 的长期记忆文件。写入后由记忆功能按它的规则读取（需开启 memories 功能）。",
        file: path.join(CODEX_HOME$1, "memories", "MEMORY.md")
      }
    ]
  },
  gemini: globalInstruction(
    "gemini",
    "Gemini CLI",
    path.join(HOME$5, ".gemini", "GEMINI.md"),
    "GEMINI.md"
  ),
  grokbuild: globalInstruction(
    "grokbuild",
    "Grok Build",
    path.join(HOME$5, ".grok", "AGENTS.md"),
    "AGENTS.md"
  ),
  opencode: globalInstruction(
    "opencode",
    "OpenCode",
    path.join(HOME$5, ".config", "opencode", "AGENTS.md"),
    "AGENTS.md"
  ),
  openclaw: globalInstruction(
    "openclaw",
    "OpenClaw",
    path.join(HOME$5, ".openclaw", "AGENTS.md"),
    "AGENTS.md"
  ),
  hermes: globalInstruction(
    "hermes",
    "Hermes",
    path.join(HOME$5, ".hermes", "SOUL.md"),
    "SOUL.md"
  ),
  pi: globalInstruction(
    "pi",
    "Pi",
    path.join(HOME$5, ".pi", "agent", "AGENTS.md"),
    "AGENTS.md"
  ),
  mcode: globalInstruction(
    "mcode",
    "MiniMax Code",
    path.join(HOME$5, ".minimax", "AGENTS.md"),
    "AGENTS.md"
  ),
  dsh: globalInstruction(
    "dsh",
    "DeepSeek Harness",
    path.join(HOME$5, ".dsh", "AGENTS.md"),
    "AGENTS.md"
  )
};
function resolveApp(value) {
  if (value === "claude-desktop") return APPS.claude;
  return APPS[value] ?? null;
}
function displayPath$2(filePath) {
  const relative = path.relative(HOME$5, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `~/${relative.split(path.sep).join("/")}`;
  }
  return filePath.replace(/\\/g, "/");
}
async function ensureDir$2(dir) {
  await fsp.mkdir(dir, { recursive: true });
}
async function statSafe$2(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}
async function readTextSafe$2(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
async function readJsonSafe$2(filePath, fallback) {
  const text = await readTextSafe$2(filePath);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
function backupRoot(app) {
  return path.join(BACKUP_BASE, app);
}
async function readBackups$2(app) {
  return readJsonSafe$2(
    path.join(backupRoot(app), "index.json"),
    []
  );
}
async function writeBackups(app, entries) {
  await ensureDir$2(backupRoot(app));
  await fsp.writeFile(
    path.join(backupRoot(app), "index.json"),
    JSON.stringify(entries, null, 2),
    "utf8"
  );
}
async function readState$2() {
  return readJsonSafe$2(STATE_FILE$2, {});
}
async function writeState$2(state) {
  await ensureDir$2(path.dirname(STATE_FILE$2));
  await fsp.writeFile(STATE_FILE$2, JSON.stringify(state, null, 2), "utf8");
}
async function backupFile$3(app, target, targetName, filePath) {
  const stat = await statSafe$2(filePath);
  const id = `${Date.now()}-${target}-${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}.bak`;
  const root = backupRoot(app);
  await ensureDir$2(root);
  if (stat?.isFile()) {
    await fsp.copyFile(filePath, path.join(root, file));
  }
  const entry = {
    id,
    app,
    target,
    targetName,
    originalPath: filePath,
    originalExisted: Boolean(stat?.isFile()),
    createdAt: Date.now(),
    size: stat?.isFile() ? stat.size : 0,
    file
  };
  const backups = await readBackups$2(app);
  backups.unshift(entry);
  await writeBackups(app, backups.slice(0, 200));
  return entry;
}
async function restoreBackup$2(app, id) {
  const backups = await readBackups$2(app);
  const entry = backups.find((item) => item.id === id);
  if (!entry) throw new Error("备份不存在");
  if (entry.originalExisted) {
    const source = path.join(backupRoot(app), entry.file);
    if (!await statSafe$2(source)) throw new Error("备份文件已丢失");
    await ensureDir$2(path.dirname(entry.originalPath));
    await fsp.copyFile(source, entry.originalPath);
  } else {
    await fsp.rm(entry.originalPath, { force: true });
  }
  return entry;
}
function extractModelInstructions(configText) {
  const match = configText.match(
    /^\s*model_instructions_file\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/m
  );
  if (!match) return null;
  const raw = match[1] ?? match[2] ?? "";
  return raw.replace(/\\\\/g, "\\");
}
function setModelInstructions(configText, value) {
  const lines = configText.split(/\r?\n/);
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*model_instructions_file\s*=/.test(lines[i])) {
      index = i;
      break;
    }
  }
  if (value === null) {
    if (index >= 0) {
      const nextIsBlank = index + 1 < lines.length && lines[index + 1].trim() === "";
      const nextNextIsTable = index + 2 < lines.length && /^\s*\[/.test(lines[index + 2]);
      if (nextIsBlank && nextNextIsTable) lines.splice(index, 2);
      else lines.splice(index, 1);
    }
    return lines.join("\n");
  }
  const line = `model_instructions_file = "${value.replace(/\\/g, "/")}"`;
  if (index >= 0) {
    lines[index] = line;
  } else {
    let insertAt = lines.findIndex((item) => /^\s*\[/.test(item));
    if (insertAt < 0) insertAt = lines.length;
    lines.splice(insertAt, 0, line, "");
  }
  return lines.join("\n");
}
function samePath$1(a, b) {
  if (!a) return false;
  const normalize = (value) => path.resolve(value.replace(/\\/g, "/")).toLowerCase();
  try {
    return normalize(a) === normalize(b);
  } catch {
    return false;
  }
}
async function buildOverview$3(app) {
  const state = await readState$2();
  const appState = state[app.id] ?? {};
  const configTarget = app.targets.find((item) => item.configFile);
  const configText = configTarget ? await readTextSafe$2(configTarget.configFile) ?? "" : "";
  const configValue = configTarget ? extractModelInstructions(configText) : null;
  const targets = [];
  for (const def of app.targets) {
    const stat = await statSafe$2(def.file);
    const content = stat?.isFile() ? await readTextSafe$2(def.file) ?? "" : "";
    const saved = appState[def.id];
    const active = def.configFile ? samePath$1(configValue, def.file) && Boolean(stat?.isFile()) : Boolean(content.trim());
    targets.push({
      id: def.id,
      name: def.name,
      description: def.description,
      path: def.file,
      displayPath: displayPath$2(def.file),
      exists: Boolean(stat?.isFile()),
      size: stat?.isFile() ? stat.size : 0,
      mtime: stat?.mtimeMs ?? null,
      content,
      active,
      injected: Boolean(saved),
      installedAt: saved?.installedAt ?? null,
      configPath: def.configFile ? displayPath$2(def.configFile) : null
    });
  }
  const homeDir = path.dirname(app.targets[0].file);
  return {
    app: app.id,
    appName: app.name,
    homeDir,
    homeDirDisplay: displayPath$2(homeDir),
    configValue,
    configValueDisplay: configValue ? displayPath$2(configValue) : null,
    targets,
    backups: (await readBackups$2(app.id)).slice(0, 30)
  };
}
async function applyInjection(app, targetId, content, mode) {
  const def = app.targets.find((item) => item.id === targetId);
  if (!def) throw new Error("未知的注入目标");
  if (typeof content !== "string") throw new Error("缺少提示词内容");
  if (Buffer.byteLength(content, "utf8") > 4 * 1024 * 1024) {
    throw new Error("提示词超过 4 MB 限制");
  }
  const state = await readState$2();
  const appState = state[app.id] ??= {};
  const first = !appState[targetId];
  const fileBackup = await backupFile$3(app.id, targetId, def.name, def.file);
  await ensureDir$2(path.dirname(def.file));
  if (def.configFile) {
    if (first) {
      const configText2 = await readTextSafe$2(def.configFile) ?? "";
      const configBackup = await backupFile$3(
        app.id,
        `${targetId}-config`,
        path.basename(def.configFile),
        def.configFile
      );
      appState[targetId] = {
        installedAt: Date.now(),
        backupId: fileBackup.id,
        originalExisted: fileBackup.originalExisted,
        originalConfigValue: extractModelInstructions(configText2),
        configBackupId: configBackup.id
      };
    }
    await fsp.writeFile(def.file, content, "utf8");
    const configText = await readTextSafe$2(def.configFile) ?? "";
    await fsp.writeFile(
      def.configFile,
      setModelInstructions(configText, def.file),
      "utf8"
    );
  } else {
    if (mode === "append" && fileBackup.originalExisted) {
      const current = await readTextSafe$2(def.file) ?? "";
      const separator = current.endsWith("\n") ? "\n" : "\n\n";
      await fsp.writeFile(def.file, current + separator + content, "utf8");
    } else {
      await fsp.writeFile(def.file, content, "utf8");
    }
    if (first) {
      appState[targetId] = {
        installedAt: Date.now(),
        backupId: fileBackup.id,
        originalExisted: fileBackup.originalExisted
      };
    }
  }
  await writeState$2(state);
  return buildOverview$3(app);
}
async function disableInjection(app, targetId) {
  const def = app.targets.find((item) => item.id === targetId);
  if (!def) throw new Error("未知的注入目标");
  const state = await readState$2();
  const saved = state[app.id]?.[targetId];
  if (!saved) throw new Error("这个目标还没有通过本工具注入过，无法自动还原");
  if (saved.backupId) {
    await restoreBackup$2(app.id, saved.backupId);
  } else {
    await fsp.rm(def.file, { force: true });
  }
  if (def.configFile) {
    const configText = await readTextSafe$2(def.configFile) ?? "";
    await fsp.writeFile(
      def.configFile,
      setModelInstructions(configText, saved.originalConfigValue ?? null),
      "utf8"
    );
  }
  if (state[app.id]) delete state[app.id][targetId];
  await writeState$2(state);
  return buildOverview$3(app);
}
async function readBody$4(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 5 * 1024 * 1024) throw new Error("请求体超过 5 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
function sendJson$6(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function handleApi$5(req, res, url) {
  const route = url.pathname;
  if (!route.startsWith("/api/inject/")) return false;
  try {
    const [, , , appId, action] = route.split("/");
    if (req.method === "GET" && appId === "apps" && !action) {
      sendJson$6(
        res,
        200,
        Object.values(APPS).map((item) => ({
          id: item.id,
          name: item.name,
          targetCount: item.targets.length
        }))
      );
      return true;
    }
    const app = resolveApp(appId ?? "");
    if (!app) throw new Error(`不支持这个应用：${appId}`);
    if (req.method === "GET" && action === "overview") {
      sendJson$6(res, 200, await buildOverview$3(app));
      return true;
    }
    if (req.method === "POST" && action === "apply") {
      const body = await readBody$4(req);
      const targetId = typeof body.target === "string" ? body.target : "";
      const mode = body.mode === "append" ? "append" : "replace";
      const content = typeof body.content === "string" ? body.content : "";
      sendJson$6(res, 200, await applyInjection(app, targetId, content, mode));
      return true;
    }
    if (req.method === "POST" && action === "disable") {
      const body = await readBody$4(req);
      const targetId = typeof body.target === "string" ? body.target : "";
      sendJson$6(res, 200, await disableInjection(app, targetId));
      return true;
    }
    if (req.method === "POST" && action === "restore") {
      const body = await readBody$4(req);
      const backupId = typeof body.backupId === "string" ? body.backupId : "";
      if (!backupId) throw new Error("缺少备份 ID");
      const entry = await restoreBackup$2(app.id, backupId);
      sendJson$6(res, 200, {
        restored: entry,
        overview: await buildOverview$3(app)
      });
      return true;
    }
    sendJson$6(res, 404, { error: "未找到接口" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson$6(res, 500, { error: message });
    return true;
  }
}
function injectApiPlugin() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handleApi$5(req, res, url).then((handled) => {
      if (!handled) next();
    });
  };
  return {
    name: "cc-switch-inject-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
const HOME$4 = os.homedir();
const LIBRARY_FILE = path.join(HOME$4, ".cc-switch", "prompt-library.json");
const STATE_FILE$1 = path.join(HOME$4, ".cc-switch", "prompt-library-state.json");
const BACKUP_ROOT$1 = path.join(HOME$4, ".cc-switch", "backups", "prompt-library");
const BACKUP_INDEX$1 = path.join(BACKUP_ROOT$1, "index.json");
const APP_TARGETS = {
  claude: { name: "Claude Code", file: path.join(HOME$4, ".claude", "CLAUDE.md") },
  "claude-desktop": {
    name: "Claude Desktop",
    file: path.join(HOME$4, ".claude", "CLAUDE.md")
  },
  codex: { name: "Codex", file: path.join(HOME$4, ".codex", "AGENTS.md") },
  gemini: { name: "Gemini CLI", file: path.join(HOME$4, ".gemini", "GEMINI.md") },
  grokbuild: {
    name: "Grok Build",
    file: path.join(HOME$4, ".grok", "AGENTS.md")
  },
  opencode: {
    name: "OpenCode",
    file: path.join(HOME$4, ".config", "opencode", "AGENTS.md")
  },
  openclaw: {
    name: "OpenClaw",
    file: path.join(HOME$4, ".openclaw", "AGENTS.md")
  },
  hermes: { name: "Hermes", file: path.join(HOME$4, ".hermes", "SOUL.md") },
  pi: { name: "Pi", file: path.join(HOME$4, ".pi", "agent", "AGENTS.md") },
  mcode: { name: "MiniMax Code", file: path.join(HOME$4, ".minimax", "AGENTS.md") },
  dsh: {
    name: "DeepSeek Harness",
    file: path.join(HOME$4, ".dsh", "AGENTS.md")
  }
};
function displayPath$1(filePath) {
  const relative = path.relative(HOME$4, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `~/${relative.split(path.sep).join("/")}`;
  }
  return filePath.replace(/\\/g, "/");
}
async function ensureDir$1(dir) {
  await fsp.mkdir(dir, { recursive: true });
}
async function statSafe$1(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}
async function readTextSafe$1(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
async function readJsonSafe$1(filePath, fallback) {
  const text = await readTextSafe$1(filePath);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
async function readLibrary() {
  const library = await readJsonSafe$1(LIBRARY_FILE, {
    version: 1,
    apps: {}
  });
  if (!library.apps) library.apps = {};
  return library;
}
async function writeLibrary(library) {
  await ensureDir$1(path.dirname(LIBRARY_FILE));
  await fsp.writeFile(LIBRARY_FILE, JSON.stringify(library, null, 2), "utf8");
}
async function readState$1() {
  const state = await readJsonSafe$1(STATE_FILE$1, { apps: {} });
  if (!state.apps) state.apps = {};
  return state;
}
async function writeState$1(state) {
  await ensureDir$1(path.dirname(STATE_FILE$1));
  await fsp.writeFile(STATE_FILE$1, JSON.stringify(state, null, 2), "utf8");
}
async function readBackups$1() {
  return readJsonSafe$1(BACKUP_INDEX$1, []);
}
async function backupFile$2(app, filePath) {
  const stat = await statSafe$1(filePath);
  const id = `${Date.now()}-${app}-${Math.random().toString(36).slice(2, 8)}`;
  await ensureDir$1(BACKUP_ROOT$1);
  const file = `${id}.bak`;
  if (stat?.isFile()) {
    await fsp.copyFile(filePath, path.join(BACKUP_ROOT$1, file));
  }
  const entry = {
    id,
    app,
    originalPath: filePath,
    originalExisted: Boolean(stat?.isFile()),
    createdAt: Date.now(),
    size: stat?.isFile() ? stat.size : 0,
    file
  };
  const backups = await readBackups$1();
  backups.unshift(entry);
  await fsp.writeFile(
    BACKUP_INDEX$1,
    JSON.stringify(backups.slice(0, 300), null, 2),
    "utf8"
  );
  return entry;
}
async function restoreBackup$1(id) {
  const backups = await readBackups$1();
  const entry = backups.find((item) => item.id === id);
  if (!entry) throw new Error("备份不存在");
  if (entry.originalExisted) {
    const source = path.join(BACKUP_ROOT$1, entry.file);
    if (!await statSafe$1(source)) throw new Error("备份文件已丢失");
    await ensureDir$1(path.dirname(entry.originalPath));
    await fsp.copyFile(source, entry.originalPath);
  } else {
    await fsp.rm(entry.originalPath, { force: true });
  }
  return entry;
}
function targetOf$1(app) {
  const target = APP_TARGETS[app];
  if (!target) throw new Error(`不支持的应用：${app}`);
  return target;
}
function bigrams(text) {
  const clean = text.toLowerCase().replace(/\s+/g, "");
  const result = /* @__PURE__ */ new Set();
  for (let i = 0; i < clean.length - 1; i += 1) {
    result.add(clean.slice(i, i + 2));
  }
  return result;
}
function similarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const item of left) {
    if (right.has(item)) shared += 1;
  }
  return 2 * shared / (left.size + right.size);
}
async function buildOverview$2(app) {
  const target = targetOf$1(app);
  const library = await readLibrary();
  const state = await readState$1();
  const stat = await statSafe$1(target.file);
  const fileContent = stat?.isFile() ? await readTextSafe$1(target.file) ?? "" : "";
  const lib = library.apps[app] ?? { currentId: null, prompts: [] };
  const current = lib.prompts.find((item) => item.id === lib.currentId);
  return {
    app,
    appName: target.name,
    path: target.file,
    displayPath: displayPath$1(target.file),
    exists: Boolean(stat?.isFile()),
    size: stat?.isFile() ? stat.size : 0,
    mtime: stat?.mtimeMs ?? null,
    fileContent,
    currentId: lib.currentId,
    currentName: current?.name ?? null,
    prompts: lib.prompts,
    state: state.apps[app] ?? null
  };
}
function normalizeApp(value) {
  if (typeof value !== "string") throw new Error("缺少应用参数");
  return value;
}
function normalizeId(value) {
  if (typeof value !== "string" || !value) throw new Error("缺少提示词 ID");
  return value;
}
async function savePrompt(body) {
  const app = normalizeApp(body.app);
  targetOf$1(app);
  const library = await readLibrary();
  const lib = library.apps[app] ??= { currentId: null, prompts: [] };
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "未命名提示词";
  const content = typeof body.content === "string" ? body.content : "";
  const description = typeof body.description === "string" ? body.description : "";
  if (!content.trim()) throw new Error("提示词内容是空的");
  if (Buffer.byteLength(content, "utf8") > 4 * 1024 * 1024) {
    throw new Error("提示词超过 4 MB 限制");
  }
  if (app === "mcode" && Buffer.byteLength(content, "utf8") > 32 * 1024) {
    throw new Error("MiniMax Code 的提示词不能超过 32 KB");
  }
  const id = typeof body.id === "string" && body.id ? body.id : `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const existing = lib.prompts.find((item) => item.id === id);
  const now = Date.now();
  if (existing) {
    existing.name = name;
    existing.description = description;
    existing.content = content;
    existing.updatedAt = now;
  } else {
    lib.prompts.push({
      id,
      name,
      description,
      content,
      createdAt: now,
      updatedAt: now
    });
  }
  await writeLibrary(library);
  return { id, overview: await buildOverview$2(app) };
}
async function deletePrompt(body) {
  const app = normalizeApp(body.app);
  targetOf$1(app);
  const id = normalizeId(body.id);
  const library = await readLibrary();
  const lib = library.apps[app];
  if (!lib) throw new Error("这个应用还没有提示词");
  lib.prompts = lib.prompts.filter((item) => item.id !== id);
  if (lib.currentId === id) lib.currentId = null;
  await writeLibrary(library);
  return buildOverview$2(app);
}
async function activatePrompt(body) {
  const app = normalizeApp(body.app);
  const target = targetOf$1(app);
  const id = normalizeId(body.id);
  const library = await readLibrary();
  const lib = library.apps[app];
  const prompt = lib?.prompts.find((item) => item.id === id);
  if (!lib || !prompt) throw new Error("提示词不存在");
  const backup = await backupFile$2(app, target.file);
  const state = await readState$1();
  if (!state.apps[app]) {
    state.apps[app] = {
      activatedAt: Date.now(),
      backupId: backup.id,
      originalExisted: backup.originalExisted
    };
    await writeState$1(state);
  }
  await ensureDir$1(path.dirname(target.file));
  await fsp.writeFile(target.file, prompt.content, "utf8");
  lib.currentId = id;
  await writeLibrary(library);
  return buildOverview$2(app);
}
async function deactivatePrompt(body) {
  const app = normalizeApp(body.app);
  const target = targetOf$1(app);
  const state = await readState$1();
  const saved = state.apps[app];
  if (!saved) throw new Error("这个应用还没有通过提示词库切换过");
  if (saved.backupId) {
    await restoreBackup$1(saved.backupId);
  } else {
    await fsp.rm(target.file, { force: true });
  }
  delete state.apps[app];
  await writeState$1(state);
  const library = await readLibrary();
  if (library.apps[app]) library.apps[app].currentId = null;
  await writeLibrary(library);
  return buildOverview$2(app);
}
async function importCurrent(body) {
  const app = normalizeApp(body.app);
  const target = targetOf$1(app);
  const content = await readTextSafe$1(target.file) ?? "";
  if (!content.trim()) throw new Error("当前提示词文件是空的");
  const library = await readLibrary();
  const lib = library.apps[app] ??= { currentId: null, prompts: [] };
  const now = Date.now();
  const baseName = `当前文件 ${new Date(now).toLocaleString("zh-CN", { hour12: false })}`;
  let name = baseName;
  let index = 2;
  while (lib.prompts.some((item) => item.name === name)) {
    name = `${baseName} (${index})`;
    index += 1;
  }
  lib.prompts.push({
    id: `p_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: `从 ${displayPath$1(target.file)} 导入`,
    content,
    createdAt: now,
    updatedAt: now
  });
  await writeLibrary(library);
  return buildOverview$2(app);
}
async function listBackups(app) {
  const backups = await readBackups$1();
  return backups.filter((item) => item.app === app).slice(0, 50);
}
async function restoreLibraryBackup(body) {
  const id = normalizeId(body.backupId);
  const entry = await restoreBackup$1(id);
  return { restored: entry, overview: await buildOverview$2(entry.app) };
}
async function findSimilar(body) {
  const app = normalizeApp(body.app);
  const content = typeof body.content === "string" ? body.content : "";
  const library = await readLibrary();
  const prompts = library.apps[app]?.prompts ?? [];
  return prompts.map((item) => ({ id: item.id, name: item.name, score: similarity(content, item.content) })).sort((a, b) => b.score - a.score).slice(0, 3);
}
async function readBody$3(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 5 * 1024 * 1024) throw new Error("请求体超过 5 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
function sendJson$5(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function handleApi$4(req, res, url) {
  const route = url.pathname;
  if (!route.startsWith("/api/prompt-library/")) return false;
  try {
    if (req.method === "GET" && route === "/api/prompt-library/overview") {
      sendJson$5(res, 200, await buildOverview$2(normalizeApp(url.searchParams.get("app"))));
      return true;
    }
    if (req.method === "GET" && route === "/api/prompt-library/backups") {
      sendJson$5(res, 200, await listBackups(normalizeApp(url.searchParams.get("app"))));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/save") {
      sendJson$5(res, 200, await savePrompt(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/delete") {
      sendJson$5(res, 200, await deletePrompt(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/activate") {
      sendJson$5(res, 200, await activatePrompt(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/deactivate") {
      sendJson$5(res, 200, await deactivatePrompt(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/import-current") {
      sendJson$5(res, 200, await importCurrent(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/restore") {
      sendJson$5(res, 200, await restoreLibraryBackup(await readBody$3(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-library/similar") {
      sendJson$5(res, 200, await findSimilar(await readBody$3(req)));
      return true;
    }
    sendJson$5(res, 404, { error: "未找到接口" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson$5(res, 500, { error: message });
    return true;
  }
}
function promptLibraryPlugin() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handleApi$4(req, res, url).then((handled) => {
      if (!handled) next();
    });
  };
  return {
    name: "cc-switch-prompt-library",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
const HOME$3 = os.homedir();
const CODEX_HOME = process.env.CODEX_HOME || path.join(HOME$3, ".codex");
const BACKUP_ROOT = path.join(HOME$3, ".cc-switch", "backups", "codex-assets");
const BACKUP_INDEX = path.join(BACKUP_ROOT, "index.json");
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_KEYS = [
  "AGENTS.md",
  "system-prompt.md",
  "config.toml",
  "memories",
  "instructions",
  "rules",
  "hooks.json",
  "hooks",
  "prompts",
  "skills"
];
const EDITABLE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".md",
  ".json",
  ".toml",
  ".rules",
  ".py",
  ".js",
  ".sh",
  ".txt",
  ".yaml",
  ".yml",
  ".jsonl"
]);
function displayPath(filePath) {
  const relative = path.relative(HOME$3, filePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `~/${relative.split(path.sep).join("/")}`;
  }
  return filePath.replace(/\\/g, "/");
}
function keyOf(filePath) {
  return path.relative(CODEX_HOME, filePath).split(path.sep).join("/");
}
function isAllowedKey(key) {
  const normalized = key.replace(/\\/g, "/");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
    return false;
  }
  return ALLOWED_KEYS.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`)
  );
}
function resolveKey(key) {
  if (!isAllowedKey(key)) throw new Error("不允许访问这个路径");
  const full = path.resolve(CODEX_HOME, key);
  const root = path.resolve(CODEX_HOME) + path.sep;
  if (!full.startsWith(root)) throw new Error("路径越界");
  return full;
}
async function statSafe(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}
async function readTextSafe(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
async function readJsonSafe(filePath, fallback) {
  const text = await readTextSafe(filePath);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}
async function makeFileEntry(filePath) {
  const stat = await statSafe(filePath);
  const ext = path.extname(filePath).toLowerCase();
  return {
    key: keyOf(filePath),
    name: path.basename(filePath),
    path: filePath,
    displayPath: displayPath(filePath),
    exists: Boolean(stat?.isFile()),
    size: stat?.isFile() ? stat.size : 0,
    mtime: stat?.mtimeMs ?? null,
    editable: EDITABLE_EXTENSIONS.has(ext) || ext === ""
  };
}
async function walkFiles(root, match, maxDepth, limit) {
  const result = [];
  async function walk(dir, depth) {
    if (result.length >= limit) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.length >= limit) return;
      if (entry.name.startsWith(".bak") || entry.name.endsWith(".bak")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) await walk(full, depth + 1);
      } else if (entry.isFile() && match(entry.name)) {
        result.push(full);
      }
    }
  }
  await walk(root, 0);
  return result;
}
function extractTomlValue(text, key) {
  const pattern = new RegExp(
    `^\\s*${key}\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)')`,
    "m"
  );
  const match = text.match(pattern);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").replace(/\\\\/g, "\\");
}
function samePath(a, b) {
  if (!a) return false;
  const normalize = (value) => path.resolve(value.replace(/\\/g, "/")).toLowerCase();
  try {
    return normalize(a) === normalize(b);
  } catch {
    return false;
  }
}
function extractHookCommands(text) {
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    const commands = [];
    const walk = (value) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          if (key === "command" && typeof item === "string") commands.push(item);
          else walk(item);
        }
      }
    };
    walk(data);
    return commands;
  } catch {
    return [];
  }
}
function classifyAsset(groupId, file, ctx) {
  const key = file.key;
  if (key === "AGENTS.md") {
    return file.size > 0 ? {
      level: "active",
      label: "生效",
      reason: "每次会话作为用户级 AGENTS.md 指令加载"
    } : { level: "inactive", label: "未生效", reason: "文件是空的" };
  }
  if (key === "system-prompt.md") {
    return samePath(ctx.modelInstructionsFile, file.path) ? {
      level: "active",
      label: "生效",
      reason: "config.toml 的 model_instructions_file 指向它"
    } : {
      level: "conditional",
      label: "待接入",
      reason: "config.toml 的 model_instructions_file 没指向它"
    };
  }
  if (key === "config.toml") {
    return {
      level: "config",
      label: "配置",
      reason: "提示词相关键的载体，不是提示词本身"
    };
  }
  if (groupId === "memory") {
    if (key === "memories/MEMORY.md") {
      return { level: "active", label: "生效", reason: "Codex memories 主记忆" };
    }
    if (key.endsWith("/raw_memories.md") || key.endsWith("/memory_summary.md")) {
      return {
        level: "auto",
        label: "自动维护",
        reason: "由 memories 功能生成 / 更新，通常不要手改"
      };
    }
    if (key.includes("/rollout_summaries/")) {
      return {
        level: "auto",
        label: "自动维护",
        reason: "自动生成的会话复盘摘要"
      };
    }
    if (key.includes("/extensions/")) {
      return {
        level: "active",
        label: "生效",
        reason: "memories 扩展指令，会被读取"
      };
    }
    if (key.includes("/skills/")) {
      return { level: "active", label: "生效", reason: "记忆技能，按需加载" };
    }
    return {
      level: "auto",
      label: "自动维护",
      reason: "由 memories 功能维护"
    };
  }
  if (groupId === "instructions") {
    return {
      level: "inactive",
      label: "未接入",
      reason: "Codex 不直接读取 instructions/，它只是提示词源文件"
    };
  }
  if (groupId === "rules") {
    return {
      level: "conditional",
      label: "条件生效",
      reason: "只有 VCO / hooks 运行时读取 rules/ 才生效"
    };
  }
  if (groupId === "hooks") {
    if (key === "hooks.json") {
      return {
        level: "active",
        label: "生效",
        reason: "Codex 生命周期钩子注册表"
      };
    }
    const normalize = (value) => value.replace(/\\/g, "/").toLowerCase();
    const registered = ctx.hookCommands.some(
      (command) => normalize(command).includes(normalize(file.path))
    );
    return registered ? {
      level: "active",
      label: "已注册",
      reason: "hooks.json 中有指向这个脚本的条目"
    } : {
      level: "inactive",
      label: "未注册",
      reason: "hooks.json 没有引用这个脚本"
    };
  }
  if (groupId === "prompts") {
    return {
      level: "active",
      label: "生效",
      reason: "斜杠命令模板，调用时作为提示词发送"
    };
  }
  if (groupId === "skills") {
    return { level: "active", label: "生效", reason: "技能提示词，按需加载" };
  }
  return { level: "auto", label: "未知", reason: "" };
}
function withStatus(groupId, file, ctx) {
  return { ...file, status: classifyAsset(groupId, file, ctx) };
}
async function buildOverview$1() {
  const configText = await readTextSafe(path.join(CODEX_HOME, "config.toml")) ?? "";
  const hooksText = await readTextSafe(path.join(CODEX_HOME, "hooks.json"));
  const ctx = {
    modelInstructionsFile: extractTomlValue(configText, "model_instructions_file"),
    hookCommands: extractHookCommands(hooksText)
  };
  const rulesText = await readTextSafe(path.join(CODEX_HOME, "rules", "default.rules")) ?? "";
  const decisionCount = (decision) => (rulesText.match(new RegExp(`decision\\s*=\\s*"${decision}"`, "g")) ?? []).length;
  const windowsSandbox = configText.match(/\[windows\][\s\S]*?^\s*sandbox\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const trustedProjects = [
    ...configText.matchAll(
      /\[projects\.'([^']+)'\]\s*\n\s*trust_level\s*=\s*"trusted"/g
    )
  ].map((match) => match[1]);
  let preToolUseHooks = 0;
  if (hooksText) {
    try {
      const parsed = JSON.parse(hooksText);
      for (const group of parsed.hooks?.PreToolUse ?? []) {
        preToolUseHooks += group.hooks?.length ?? 0;
      }
    } catch {
    }
  }
  const primary = (await Promise.all(
    ["AGENTS.md", "system-prompt.md"].map(
      (key) => makeFileEntry(path.join(CODEX_HOME, key))
    )
  )).map((file) => withStatus("primary", file, ctx));
  const configFile = withStatus(
    "config",
    await makeFileEntry(path.join(CODEX_HOME, "config.toml")),
    ctx
  );
  const groups = [
    {
      id: "primary",
      name: "主提示词",
      description: "Codex 每次会话都会读取的位置。AGENTS.md 是用户级全局指令；system-prompt.md 只有在 config.toml 的 model_instructions_file 指向它时才替换基础系统提示。",
      files: primary
    },
    {
      id: "config",
      name: "config.toml（提示词相关配置）",
      description: "model_instructions_file、developer_instructions、compact_prompt 等键都在这里。",
      files: [configFile]
    }
  ];
  const dirGroups = [
    {
      id: "memory",
      name: "记忆",
      description: "Codex 的 memories 功能：MEMORY.md 主记忆、raw_memories.md 原始记录、memory_summary.md 摘要、rollout_summaries 会话复盘、extensions 临时指令。",
      dir: "memories",
      match: (name) => /\.(md|json|jsonl)$/i.test(name),
      maxDepth: 3,
      limit: 120
    },
    {
      id: "instructions",
      name: "指令集",
      description: "gpt-contract、persona、unrestricted 等提示词包。Codex 原生不直接读这个目录，通常由安装器或手动粘贴使用。",
      dir: "instructions",
      match: (name) => /\.md$/i.test(name),
      maxDepth: 1,
      limit: 60
    },
    {
      id: "rules",
      name: "规则",
      description: "rules/default.rules 以及 common、typescript 规则。第三方框架 / hooks 会读取这些规则。",
      dir: "rules",
      match: (name) => /\.(rules|md)$/i.test(name),
      maxDepth: 3,
      limit: 100
    },
    {
      id: "hooks",
      name: "钩子与注入",
      description: "hooks.json 注册生命周期钩子；hooks/ 里的脚本会在 SessionStart、UserPromptSubmit 等时机注入提示词。",
      dir: "hooks",
      match: (name) => /\.(py|js|sh)$/i.test(name),
      maxDepth: 1,
      limit: 60
    },
    {
      id: "prompts",
      name: "自定义命令",
      description: "prompts/*.md 是 Codex 的斜杠命令模板，调用时作为提示词发送。",
      dir: "prompts",
      match: (name) => /\.md$/i.test(name),
      maxDepth: 1,
      limit: 80
    },
    {
      id: "skills",
      name: "技能（SKILL.md）",
      description: "skills/<名称>/SKILL.md 是按需加载的技能提示词。",
      dir: "skills",
      match: (name) => /^SKILL\.md$/i.test(name),
      maxDepth: 2,
      limit: 300
    }
  ];
  for (const def of dirGroups) {
    const root = path.join(CODEX_HOME, def.dir);
    const files = await walkFiles(root, def.match, def.maxDepth, def.limit);
    groups.push({
      id: def.id,
      name: def.name,
      description: def.description,
      files: (await Promise.all(files.sort().map((file) => makeFileEntry(file)))).map((file) => withStatus(def.id, file, ctx))
    });
  }
  const hooksGroup = groups.find((group) => group.id === "hooks");
  if (hooksGroup) {
    hooksGroup.files.unshift(
      withStatus(
        "hooks",
        await makeFileEntry(path.join(CODEX_HOME, "hooks.json")),
        ctx
      )
    );
  }
  return {
    codexHome: CODEX_HOME,
    codexHomeDisplay: displayPath(CODEX_HOME),
    config: {
      modelInstructionsFile: ctx.modelInstructionsFile,
      developerInstructions: extractTomlValue(configText, "developer_instructions"),
      compactPrompt: extractTomlValue(configText, "compact_prompt"),
      experimentalCompactPromptFile: extractTomlValue(
        configText,
        "experimental_compact_prompt_file"
      ),
      projectDocMaxBytes: extractTomlValue(configText, "project_doc_max_bytes"),
      sandboxMode: extractTomlValue(configText, "sandbox_mode"),
      approvalPolicy: extractTomlValue(configText, "approval_policy")
    },
    security: {
      sandboxMode: extractTomlValue(configText, "sandbox_mode"),
      approvalPolicy: extractTomlValue(configText, "approval_policy"),
      windowsSandbox,
      rules: {
        allow: decisionCount("allow"),
        deny: decisionCount("deny"),
        ask: decisionCount("ask")
      },
      trustedProjects,
      preToolUseHooks
    },
    groups,
    fileCount: groups.reduce((total, group) => total + group.files.length, 0)
  };
}
async function readFileAsset(key) {
  const full = resolveKey(key);
  const stat = await statSafe(full);
  if (!stat?.isFile()) throw new Error("文件不存在");
  if (stat.size > MAX_FILE_SIZE) throw new Error("文件超过 4 MB，无法在界面里编辑");
  return {
    key,
    path: full,
    displayPath: displayPath(full),
    size: stat.size,
    mtime: stat.mtimeMs,
    content: await readTextSafe(full) ?? ""
  };
}
async function readBackups() {
  return readJsonSafe(BACKUP_INDEX, []);
}
async function backupFile$1(key, filePath) {
  const stat = await statSafe(filePath);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = `${id}.bak`;
  await ensureDir(BACKUP_ROOT);
  if (stat?.isFile()) await fsp.copyFile(filePath, path.join(BACKUP_ROOT, file));
  const entry = {
    id,
    key,
    originalPath: filePath,
    originalExisted: Boolean(stat?.isFile()),
    createdAt: Date.now(),
    size: stat?.isFile() ? stat.size : 0,
    file
  };
  const backups = await readBackups();
  backups.unshift(entry);
  await fsp.writeFile(
    BACKUP_INDEX,
    JSON.stringify(backups.slice(0, 300), null, 2),
    "utf8"
  );
  return entry;
}
async function saveFileAsset(key, content) {
  if (typeof content !== "string") throw new Error("缺少文件内容");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
    throw new Error("内容超过 4 MB");
  }
  const full = resolveKey(key);
  const stat = await statSafe(full);
  const mode = stat?.isFile() ? stat.mode : void 0;
  const backup = await backupFile$1(key, full);
  await ensureDir(path.dirname(full));
  await fsp.writeFile(full, content, "utf8");
  if (mode !== void 0) {
    try {
      await fsp.chmod(full, mode);
    } catch {
    }
  }
  return { backupId: backup.id, overview: await buildOverview$1() };
}
async function restoreBackup(id) {
  const backups = await readBackups();
  const entry = backups.find((item) => item.id === id);
  if (!entry) throw new Error("备份不存在");
  if (entry.originalExisted) {
    const source = path.join(BACKUP_ROOT, entry.file);
    if (!await statSafe(source)) throw new Error("备份文件已丢失");
    await ensureDir(path.dirname(entry.originalPath));
    await fsp.copyFile(source, entry.originalPath);
  } else {
    await fsp.rm(entry.originalPath, { force: true });
  }
  return { restored: entry, overview: await buildOverview$1() };
}
async function readBody$2(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 5 * 1024 * 1024) throw new Error("请求体超过 5 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
function sendJson$4(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function handleApi$3(req, res, url) {
  const route = url.pathname;
  if (!route.startsWith("/api/codex-assets/")) return false;
  try {
    if (req.method === "GET" && route === "/api/codex-assets/overview") {
      sendJson$4(res, 200, await buildOverview$1());
      return true;
    }
    if (req.method === "GET" && route === "/api/codex-assets/file") {
      const key = url.searchParams.get("key") ?? "";
      sendJson$4(res, 200, await readFileAsset(key));
      return true;
    }
    if (req.method === "GET" && route === "/api/codex-assets/backups") {
      sendJson$4(res, 200, (await readBackups()).slice(0, 80));
      return true;
    }
    if (req.method === "POST" && route === "/api/codex-assets/file") {
      const body = await readBody$2(req);
      const key = typeof body.key === "string" ? body.key : "";
      const content = typeof body.content === "string" ? body.content : "";
      sendJson$4(res, 200, await saveFileAsset(key, content));
      return true;
    }
    if (req.method === "POST" && route === "/api/codex-assets/restore") {
      const body = await readBody$2(req);
      const backupId = typeof body.backupId === "string" ? body.backupId : "";
      if (!backupId) throw new Error("缺少备份 ID");
      sendJson$4(res, 200, await restoreBackup(backupId));
      return true;
    }
    sendJson$4(res, 404, { error: "未找到接口" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson$4(res, 500, { error: message });
    return true;
  }
}
function codexAssetsPlugin() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handleApi$3(req, res, url).then((handled) => {
      if (!handled) next();
    });
  };
  return {
    name: "cc-switch-codex-assets",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
const HOME$2 = os.homedir();
const CARDS_FILE$1 = path.join(HOME$2, ".cc-switch", "prompt-cards.json");
const MODE_NOTES = {
  fill: "用户自己带了 system 就完全不动。最保守，程序化调用不受影响。对 Claude Code 等于永不生效——它每个请求都带 system。",
  prepend: "插在用户 system 前面，用户的保留。注意：Anthropic 协议下会顶掉第一个 block 上的 cache_control 断点，每轮全价重发。",
  append: "追加到用户 system 后面。Claude Code 推荐这个——cache 断点在前面的 block 上，不受影响。",
  override: "扇掉用户的 system，只留卡。会废掉客户端自带的工具说明，谨慎。"
};
const EMPTY_STORE = { version: 1, currentId: null, cards: [] };
function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[㐀-鿿぀-ヿ가-힯]/g) ?? []).length;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4);
}
function toBlocks(value) {
  if (typeof value === "string") {
    return value ? [{ type: "text", text: value }] : [];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item) => typeof item === "object" && item !== null
    );
  }
  return [];
}
function blockText(block) {
  return typeof block.text === "string" ? block.text : "";
}
function marker(card) {
  return `<!-- cc-switch-card:${card.id} -->`;
}
function markedText(card) {
  return `${marker(card)}
${card.system}`;
}
function injectCard(input, card, protocol) {
  if (!card) return { body: input, injected: false, skipped: "没有选中的卡" };
  if (!card.enabled)
    return { body: input, injected: false, skipped: "这张卡已停用" };
  if (!card.system.trim())
    return { body: input, injected: false, skipped: "卡的正文是空的" };
  const body = { ...input };
  const mark = marker(card);
  if (protocol === "openai_responses") {
    const existing = typeof body.instructions === "string" ? body.instructions : "";
    if (existing.includes(mark)) {
      return { body: input, injected: false, skipped: "已经注入过（幂等命中）" };
    }
    if (card.mode === "fill" && existing.trim()) {
      return {
        body: input,
        injected: false,
        skipped: "fill 模式：用户自带 instructions"
      };
    }
    const parts = card.mode === "override" || !existing.trim() ? [markedText(card)] : card.mode === "append" ? [existing, markedText(card)] : [markedText(card), existing];
    body.instructions = parts.join("\n\n");
    return { body, injected: true, skipped: null };
  }
  if (protocol === "anthropic") {
    const blocks = toBlocks(body.system);
    if (blocks.some((block) => blockText(block).includes(mark))) {
      return { body: input, injected: false, skipped: "已经注入过（幂等命中）" };
    }
    if (card.mode === "fill" && blocks.length > 0) {
      return {
        body: input,
        injected: false,
        skipped: "fill 模式：用户自带 system（Claude Code 总是自带）"
      };
    }
    const own2 = { type: "text", text: markedText(card) };
    const next2 = card.mode === "override" ? [own2] : card.mode === "append" ? [...blocks, own2] : [own2, ...blocks];
    body.system = next2;
    body.messages = injectFirstMes(body.messages, card);
    return { body, injected: true, skipped: null };
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const isSystem = (msg) => msg.role === "system" || msg.role === "developer";
  if (messages.some(
    (msg) => isSystem(msg) && typeof msg.content === "string" && msg.content.includes(mark)
  )) {
    return { body: input, injected: false, skipped: "已经注入过（幂等命中）" };
  }
  const hasOwn = messages.some(isSystem);
  if (card.mode === "fill" && hasOwn) {
    return {
      body: input,
      injected: false,
      skipped: "fill 模式：用户自带 system"
    };
  }
  const kept = card.mode === "override" ? messages.filter((msg) => !isSystem(msg)) : messages;
  const own = { role: "system", content: markedText(card) };
  let next;
  if (card.mode === "append" && hasOwn) {
    const lastSystem = kept.reduce(
      (acc, msg, index) => isSystem(msg) ? index : acc,
      -1
    );
    next = [...kept.slice(0, lastSystem + 1), own, ...kept.slice(lastSystem + 1)];
  } else {
    next = [own, ...kept];
  }
  body.messages = injectFirstMes(next, card);
  return { body, injected: true, skipped: null };
}
function injectFirstMes(value, card) {
  if (!card.firstMes.trim()) return value;
  if (!Array.isArray(value)) return value;
  const messages = value;
  const userTurns = messages.filter((msg) => msg.role === "user").length;
  if (userTurns > 1) return value;
  const greeting = { role: "assistant", content: card.firstMes };
  const firstUser = messages.findIndex((msg) => msg.role === "user");
  if (firstUser < 0) return [...messages, greeting];
  return [
    ...messages.slice(0, firstUser),
    greeting,
    ...messages.slice(firstUser)
  ];
}
const SAMPLES = {
  anthropic: {
    model: "claude-opus-5-5",
    max_tokens: 4096,
    stream: true,
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [{ role: "user", content: "把这个函数改成异步的" }],
    tools: [{ name: "Read", description: "Reads a file" }]
  },
  openai_chat: {
    model: "gpt-5",
    stream: true,
    messages: [
      { role: "system", content: "你是一个有帮助的助手。" },
      { role: "user", content: "在吗" }
    ]
  },
  openai_responses: {
    model: "gpt-5",
    stream: true,
    instructions: "你是一个有帮助的助手。",
    input: [{ role: "user", content: "在吗" }]
  }
};
const PROTOCOL_LABELS = {
  anthropic: "/v1/messages（Claude Code）",
  openai_chat: "/v1/chat/completions",
  openai_responses: "/v1/responses"
};
async function readStore() {
  try {
    const text = await fsp.readFile(CARDS_FILE$1, "utf8");
    const parsed = JSON.parse(text);
    return {
      version: 1,
      currentId: parsed.currentId ?? null,
      cards: Array.isArray(parsed.cards) ? parsed.cards : []
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}
async function writeStore(store) {
  await fsp.mkdir(path.dirname(CARDS_FILE$1), { recursive: true });
  await fsp.writeFile(CARDS_FILE$1, JSON.stringify(store, null, 2), "utf8");
}
function slugify(value, fallback) {
  const slug = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || fallback;
}
function uniqueId(base, taken) {
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1e3; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
function normalizeMode(value) {
  return value === "fill" || value === "prepend" || value === "append" || value === "override" ? value : "append";
}
function asString(value) {
  return typeof value === "string" ? value : "";
}
async function buildOverview() {
  const store = await readStore();
  const current = store.cards.find((card) => card.id === store.currentId) ?? null;
  const previews = Object.keys(SAMPLES).map((protocol) => {
    const sample = SAMPLES[protocol];
    const result = injectCard(sample, current, protocol);
    return {
      protocol,
      label: PROTOCOL_LABELS[protocol],
      before: sample,
      after: result.body,
      injected: result.injected,
      skipped: result.skipped
    };
  });
  return {
    file: CARDS_FILE$1,
    fileDisplay: `~/${path.relative(HOME$2, CARDS_FILE$1).split(path.sep).join("/")}`,
    currentId: store.currentId,
    cards: store.cards,
    modeNotes: MODE_NOTES,
    previews
  };
}
async function saveCard(input) {
  const store = await readStore();
  const rawId = asString(input.id);
  const existingIndex = rawId ? store.cards.findIndex((card) => card.id === rawId) : -1;
  const name = asString(input.name).trim() || "未命名人物卡";
  const system = asString(input.system);
  const firstMes = asString(input.firstMes);
  const mode = normalizeMode(input.mode);
  const enabled = input.enabled !== false;
  if (system.length > 512 * 1024) throw new Error("卡的正文超过 512 KB");
  const now = Date.now();
  const tokenEstimate = estimateTokens(system) + estimateTokens(firstMes);
  if (existingIndex >= 0) {
    const previous = store.cards[existingIndex];
    store.cards[existingIndex] = {
      ...previous,
      name,
      system,
      firstMes,
      mode,
      enabled,
      tokenEstimate,
      updatedAt: now
    };
    if (!store.currentId) store.currentId = previous.id;
  } else {
    const id = uniqueId(
      slugify(asString(input.id) || name, `card-${now.toString(36)}`),
      store.cards.map((card) => card.id)
    );
    store.cards.unshift({
      id,
      name,
      system,
      firstMes,
      mode,
      enabled,
      tokenEstimate,
      createdAt: now,
      updatedAt: now
    });
    store.currentId = id;
  }
  await writeStore(store);
  return buildOverview();
}
async function deleteCard(id) {
  const store = await readStore();
  store.cards = store.cards.filter((card) => card.id !== id);
  if (store.currentId === id) store.currentId = store.cards[0]?.id ?? null;
  await writeStore(store);
  return buildOverview();
}
async function selectCard(id) {
  const store = await readStore();
  if (id && !store.cards.some((card) => card.id === id)) {
    throw new Error("这张卡不存在");
  }
  store.currentId = id;
  await writeStore(store);
  return buildOverview();
}
async function readBody$1(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("请求体超过 2 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
function sendJson$3(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function handleApi$2(req, res, url) {
  const route = url.pathname;
  if (!route.startsWith("/api/prompt-cards")) return false;
  try {
    if (req.method === "GET" && route === "/api/prompt-cards/overview") {
      sendJson$3(res, 200, await buildOverview());
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-cards/save") {
      sendJson$3(res, 200, await saveCard(await readBody$1(req)));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-cards/delete") {
      const body = await readBody$1(req);
      const id = asString(body.id);
      if (!id) throw new Error("缺少卡 id");
      sendJson$3(res, 200, await deleteCard(id));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-cards/select") {
      const body = await readBody$1(req);
      const id = body.id === null ? null : asString(body.id);
      sendJson$3(res, 200, await selectCard(id || null));
      return true;
    }
    if (req.method === "POST" && route === "/api/prompt-cards/dry-run") {
      const body = await readBody$1(req);
      const store = await readStore();
      const cardId = asString(body.cardId) || store.currentId;
      const card = store.cards.find((item) => item.id === cardId) ?? null;
      const protocol = asString(body.protocol) || "anthropic";
      const payload = typeof body.body === "object" && body.body !== null ? body.body : SAMPLES[protocol];
      const first = injectCard(payload, card, protocol);
      const second = injectCard(first.body, card, protocol);
      sendJson$3(res, 200, {
        protocol,
        before: payload,
        after: first.body,
        injected: first.injected,
        skipped: first.skipped,
        idempotent: JSON.stringify(second.body) === JSON.stringify(first.body)
      });
      return true;
    }
    sendJson$3(res, 404, { error: "未找到接口" });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson$3(res, 500, { error: message });
    return true;
  }
}
function promptCardsPlugin() {
  const middleware = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handleApi$2(req, res, url).then((handled) => {
      if (!handled) next();
    });
  };
  return {
    name: "cc-switch-prompt-cards",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
class TomlError extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
}
function isEscaped(str, ptr) {
  let i = 0;
  while (str[ptr - ++i] === "\\")
    ;
  return --i && i % 2;
}
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
    ptr++;
  return banComments || c !== "#" ? ptr : skipVoid(str, skipComment(str, ptr), banNewLines);
}
function skipUntil(str, ptr, sep, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
    } else if (c === sep) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
function getStringEnd(str, seek) {
  let first = str[seek];
  let target = first === str[seek + 1] && str[seek + 1] === str[seek + 2] ? str.slice(seek, seek + 3) : first;
  seek += target.length - 1;
  do
    seek = str.indexOf(target, ++seek);
  while (seek > -1 && first !== "'" && isEscaped(str, seek));
  if (seek > -1) {
    seek += target.length;
    if (target.length > 1) {
      if (str[seek] === first)
        seek++;
      if (str[seek] === first)
        seek++;
    }
  }
  return seek;
}
let DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}:\d{2}(?:\.\d+)?)?(Z|[-+]\d{2}:\d{2})?$/i;
class TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
}
let INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
let FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
let LEADING_ZERO = /^[+-]?0[0-9_]/;
let ESCAPE_REGEX = /^[0-9a-f]{4,8}$/i;
let ESC_MAP = {
  b: "\b",
  t: "	",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\"
};
function parseString(str, ptr = 0, endPtr = str.length) {
  let isLiteral = str[ptr] === "'";
  let isMultiline = str[ptr++] === str[ptr] && str[ptr] === str[ptr + 1];
  if (isMultiline) {
    endPtr -= 2;
    if (str[ptr += 2] === "\r")
      ptr++;
    if (str[ptr] === "\n")
      ptr++;
  }
  let tmp = 0;
  let isEscape;
  let parsed = "";
  let sliceStart = ptr;
  while (ptr < endPtr - 1) {
    let c = str[ptr++];
    if (c === "\n" || c === "\r" && str[ptr] === "\n") {
      if (!isMultiline) {
        throw new TomlError("newlines are not allowed in strings", {
          toml: str,
          ptr: ptr - 1
        });
      }
    } else if (c < " " && c !== "	" || c === "") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: ptr - 1
      });
    }
    if (isEscape) {
      isEscape = false;
      if (c === "u" || c === "U") {
        let code = str.slice(ptr, ptr += c === "u" ? 4 : 8);
        if (!ESCAPE_REGEX.test(code)) {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
        try {
          parsed += String.fromCodePoint(parseInt(code, 16));
        } catch {
          throw new TomlError("invalid unicode escape", {
            toml: str,
            ptr: tmp
          });
        }
      } else if (isMultiline && (c === "\n" || c === " " || c === "	" || c === "\r")) {
        ptr = skipVoid(str, ptr - 1, true);
        if (str[ptr] !== "\n" && str[ptr] !== "\r") {
          throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
            toml: str,
            ptr: tmp
          });
        }
        ptr = skipVoid(str, ptr);
      } else if (c in ESC_MAP) {
        parsed += ESC_MAP[c];
      } else {
        throw new TomlError("unrecognized escape sequence", {
          toml: str,
          ptr: tmp
        });
      }
      sliceStart = ptr;
    } else if (!isLiteral && c === "\\") {
      tmp = ptr - 1;
      isEscape = true;
      parsed += str.slice(sliceStart, tmp);
    }
  }
  return parsed + str.slice(sliceStart, endPtr - 1);
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}
function sliceAndTrimEndOf(str, startPtr, endPtr, allowNewLines) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  let trimmed = value.trimEnd();
  if (!allowNewLines) {
    let newlineIdx = value.indexOf("\n", trimmed.length);
    if (newlineIdx > -1) {
      throw new TomlError("newlines are not allowed in inline tables", {
        toml: str,
        ptr: startPtr + newlineIdx
      });
    }
  }
  return [trimmed, commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    let newPtr = end ? skipUntil(str, endPtr2, ",", end) : endPtr2;
    if (endPtr2 - newPtr && end === "}") {
      let nextNewLine = indexOfNewline(str, endPtr2, newPtr);
      if (nextNewLine > -1) {
        throw new TomlError("newlines are not allowed in inline tables", {
          toml: str,
          ptr: nextNewLine
        });
      }
    }
    return [value, newPtr];
  }
  let endPtr;
  if (c === '"' || c === "'") {
    endPtr = getStringEnd(str, ptr);
    let parsed = parseString(str, ptr, endPtr);
    if (end) {
      endPtr = skipVoid(str, endPtr, end !== "]");
      if (str[endPtr] && str[endPtr] !== "," && str[endPtr] !== end && str[endPtr] !== "\n" && str[endPtr] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr
        });
      }
      endPtr += +(str[endPtr] === ",");
    }
    return [parsed, endPtr];
  }
  endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - +(str[endPtr - 1] === ","), end === "]");
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    endPtr += +(str[endPtr] === ",");
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}
let KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let eos = getStringEnd(str, ptr);
        if (eos < 0) {
          throw new TomlError("unfinished string encountered", {
            toml: str,
            ptr
          });
        }
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(parseString(str, ptr, eos));
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  let comma = 0;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    let err = { toml: str, ptr: ptr - 1 };
    if (c === "\n") {
      throw new TomlError("newlines are not allowed in inline tables", err);
    } else if (c === "#") {
      throw new TomlError("inline tables cannot contain comments", err);
    } else if (c === ",") {
      throw new TomlError("expected key-value, found comma", err);
    } else if (c !== " " && c !== "	") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
      comma = str[ptr - 1] === "," ? ptr - 1 : 0;
    }
  }
  if (comma) {
    throw new TomlError("trailing commas are not allowed in inline tables", {
      toml: str,
      ptr: comma
    });
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}
const HOME$1 = process.env.HANSHUANG_HOME || os.homedir();
const CONFIG_FILE = path.join(HOME$1, ".cc-switch", "seep-config.json");
const BACKUP_DIR$1 = path.join(HOME$1, ".cc-switch", "backups", "seep-mcp");
const SERVER_REL = path.join("Tool", "mcp", "seep_mcp_server.py");
const PYTHON = process.env.SEEP_PYTHON || "python";
const PROTOCOL_VERSION = "2025-06-18";
const CALL_TIMEOUT_MS = 6e5;
const TOML_START = "# >>> 寒霜注入工具: seep MCP >>>";
const TOML_END = "# <<< 寒霜注入工具: seep MCP <<<";
async function readConfig() {
  try {
    const text = await fsp.readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function writeConfig(config) {
  await fsp.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}
function defaultRootCandidates() {
  return [
    process.env.SEEP_ROOT,
    path.join(os.homedir(), "seep-reverse-lab"),
    path.join(os.homedir(), "Seep-Reverse-Lab")
  ].filter((value) => Boolean(value));
}
function serverFileOf(root) {
  return path.join(root, SERVER_REL);
}
async function isSeepRoot(root) {
  try {
    const stat = await fsp.stat(serverFileOf(root));
    return stat.isFile();
  } catch {
    return false;
  }
}
async function resolveRoot() {
  const config = await readConfig();
  if (config.root && await isSeepRoot(config.root)) return config.root;
  for (const candidate of defaultRootCandidates()) {
    if (await isSeepRoot(candidate)) {
      await writeConfig({ root: candidate });
      return candidate;
    }
  }
  return config.root ?? defaultRootCandidates()[0] ?? "";
}
class SeepSession {
  constructor(root) {
    this.child = null;
    this.reader = null;
    this.nextId = 1;
    this.pending = /* @__PURE__ */ new Map();
    this.starting = null;
    this.stderrLines = [];
    this.tools = null;
    this.serverInfo = null;
    this.root = root;
  }
  get running() {
    return this.child != null;
  }
  get cachedTools() {
    return this.tools ?? [];
  }
  get info() {
    return this.serverInfo;
  }
  get stderrTail() {
    return this.stderrLines.slice(-40).join("\n");
  }
  async ensureStarted() {
    if (this.child) return;
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = null;
      });
    }
    await this.starting;
  }
  async start() {
    const serverFile = serverFileOf(this.root);
    if (!await isSeepRoot(this.root)) {
      throw new Error(`找不到 Seep MCP 服务：${serverFile}`);
    }
    const child = spawn(PYTHON, [serverFile], {
      cwd: this.root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1"
      }
    });
    this.child = child;
    liveSessions.add(this);
    registerProcessCleanup();
    this.tools = null;
    this.serverInfo = null;
    this.stderrLines = [];
    child.on("error", (error) => {
      this.failAll(error);
      this.child = null;
    });
    child.on("exit", (code, signal) => {
      this.failAll(
        new Error(
          `Seep MCP 进程已退出（code=${code ?? "null"}, signal=${signal ?? "null"}）`
        )
      );
      this.child = null;
      this.tools = null;
      this.serverInfo = null;
      liveSessions.delete(this);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trimEnd();
      if (!text) return;
      this.stderrLines.push(text);
      if (this.stderrLines.length > 80) {
        this.stderrLines.splice(0, this.stderrLines.length - 80);
      }
    });
    this.reader = readline.createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));
    try {
      const init = await this.sendRequest(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "hanshuang-inject-tool", version: "1.0.0" }
        },
        3e4
      );
      this.serverInfo = init?.serverInfo ?? null;
      this.notify("notifications/initialized", {});
      const list = await this.sendRequest("tools/list", {}, 3e4);
      this.tools = Array.isArray(list?.tools) ? list.tools : [];
    } catch (error) {
      this.stop();
      throw error;
    }
  }
  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.stderrLines.push(`[non-json stdout] ${line.slice(0, 500)}`);
      return;
    }
    if (message.method && message.id != null) {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: "客户端不支持该服务端请求" }
      });
      return;
    }
    const id = typeof message.id === "number" ? message.id : null;
    if (id == null) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }
  write(payload) {
    if (!this.child) throw new Error("Seep MCP 进程未启动");
    this.child.stdin.write(JSON.stringify(payload) + "\n");
  }
  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }
  sendRequest(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时（${Math.round(timeoutMs / 1e3)} 秒）`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  failAll(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
  async refreshTools() {
    await this.ensureStarted();
    const list = await this.sendRequest("tools/list", {}, 3e4);
    this.tools = Array.isArray(list?.tools) ? list.tools : [];
    return this.tools;
  }
  async callTool(name, args, timeoutMs = CALL_TIMEOUT_MS) {
    await this.ensureStarted();
    return await this.sendRequest(
      "tools/call",
      { name, arguments: args },
      timeoutMs
    );
  }
  stop() {
    this.failAll(new Error("Seep MCP 会话已关闭"));
    try {
      this.reader?.close();
    } catch {
    }
    this.reader = null;
    const child = this.child;
    this.child = null;
    this.tools = null;
    this.serverInfo = null;
    liveSessions.delete(this);
    if (child) {
      try {
        child.stdin.end();
      } catch {
      }
      try {
        child.kill();
      } catch {
      }
    }
  }
}
let session = null;
const liveSessions = /* @__PURE__ */ new Set();
let cleanupRegistered = false;
function registerProcessCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => {
    for (const current of liveSessions) current.stop();
    liveSessions.clear();
  };
  process.once("exit", cleanup);
  process.once("beforeExit", cleanup);
}
async function getSession() {
  const root = await resolveRoot();
  if (!session || session.root !== root) {
    session?.stop();
    session = new SeepSession(root);
  }
  return session;
}
const TARGETS = [
  {
    app: "claude",
    label: "Claude Code",
    kind: "json",
    file: () => path.join(HOME$1, ".claude.json"),
    holder: "mcpServers",
    supported: true
  },
  {
    app: "codex",
    label: "Codex",
    kind: "toml",
    file: () => path.join(HOME$1, ".codex", "config.toml"),
    supported: true
  },
  {
    app: "gemini",
    label: "Gemini CLI",
    kind: "json",
    file: () => path.join(HOME$1, ".gemini", "settings.json"),
    holder: "mcpServers",
    supported: true
  },
  {
    app: "grokbuild",
    label: "Grok Build",
    kind: "toml",
    file: () => path.join(HOME$1, ".grok", "config.toml"),
    supported: true
  },
  {
    app: "opencode",
    label: "OpenCode",
    kind: "json",
    file: () => path.join(HOME$1, ".config", "opencode", "opencode.json"),
    holder: "mcp",
    supported: true
  },
  {
    app: "pi",
    label: "Pi",
    kind: "json",
    file: () => path.join(HOME$1, ".pi", "agent", "mcp.json"),
    holder: "mcpServers",
    supported: true
  },
  {
    app: "mcode",
    label: "MiniMax Code",
    kind: "json",
    file: () => path.join(HOME$1, ".minimax", "mcp.json"),
    holder: "mcpServers",
    supported: true
  },
  {
    app: "hermes",
    label: "Hermes",
    kind: "yaml",
    file: () => path.join(HOME$1, ".hermes", "config.yaml"),
    supported: false,
    note: "Hermes 使用 YAML 配置，当前版本暂不自动写入；可在 Hermes 里手动添加。"
  }
];
function targetOf(app) {
  const target = TARGETS.find((item) => item.app === app);
  if (!target) throw new Error(`未知应用：${app}`);
  return target;
}
function stdioSpec(serverFile) {
  return {
    type: "stdio",
    command: PYTHON,
    args: [serverFile],
    env: { PYTHONIOENCODING: "utf-8" }
  };
}
function specForTarget(target, serverFile) {
  const spec = stdioSpec(serverFile);
  if (target.app === "gemini") {
    return { command: spec.command, args: spec.args, env: spec.env };
  }
  if (target.app === "opencode") {
    return {
      type: "local",
      command: [spec.command, ...spec.args],
      environment: spec.env,
      enabled: true
    };
  }
  return spec;
}
async function readJsonFile(file) {
  let text;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${file} 失败：${message}`);
  }
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("顶层不是对象");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取 ${file} 失败：${message}`);
  }
}
async function readTextFile(file) {
  try {
    return await fsp.readFile(file, "utf8");
  } catch {
    return "";
  }
}
async function backupFile(file) {
  try {
    await fsp.access(file);
  } catch {
    return null;
  }
  await fsp.mkdir(BACKUP_DIR$1, { recursive: true });
  const backup = path.join(
    BACKUP_DIR$1,
    `${Date.now()}-${path.basename(file)}`
  );
  await fsp.copyFile(file, backup);
  return backup;
}
async function writeFileAtomic(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temp, content, "utf8");
  try {
    await fsp.rename(temp, file);
  } catch {
    await fsp.rm(file, { force: true });
    await fsp.rename(temp, file);
  }
}
function jsonHolderOf(data, holder) {
  const current = data[holder];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current;
  }
  const next = {};
  data[holder] = next;
  return next;
}
function normalizePath(value) {
  const normalized = value.replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function seepEntryState(value, serverFile) {
  if (!value || typeof value !== "object") {
    return { installed: false, matches: false };
  }
  const record = value;
  const args = Array.isArray(record.args) ? record.args : [];
  const command = Array.isArray(record.command) ? record.command : [];
  const paths = [...args, ...command].filter(
    (item) => typeof item === "string"
  );
  const installed = paths.some(
    (item) => normalizePath(item).endsWith("seep_mcp_server.py")
  );
  const target = normalizePath(serverFile);
  return {
    installed,
    matches: paths.some((item) => normalizePath(item) === target)
  };
}
function stripSeepToml(text) {
  let next = text;
  const marker2 = new RegExp(
    `\\n?${TOML_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${TOML_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    "g"
  );
  next = next.replace(marker2, "\n");
  const lines = next.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (/^\s*\[mcp_servers\.seep\]\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) {
      skipping = false;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
function seepTomlBlock(serverFile) {
  return [
    TOML_START,
    "[mcp_servers.seep]",
    `command = ${JSON.stringify(PYTHON)}`,
    `args = [${JSON.stringify(serverFile)}]`,
    'env = { PYTHONIOENCODING = "utf-8" }',
    TOML_END
  ].join("\n");
}
async function setJsonTarget(target, serverFile, enabled) {
  const file = target.file();
  const data = await readJsonFile(file);
  const holder = jsonHolderOf(data, target.holder ?? "mcpServers");
  if (enabled) {
    holder.seep = specForTarget(target, serverFile);
  } else {
    delete holder.seep;
  }
  const backup = await backupFile(file);
  await writeFileAtomic(file, JSON.stringify(data, null, 2) + "\n");
  return { changed: true, backup };
}
async function setTomlTarget(target, serverFile, enabled) {
  const file = target.file();
  const existing = await readTextFile(file);
  const base = stripSeepToml(existing);
  const next = enabled ? `${base}${base ? "\n\n" : ""}${seepTomlBlock(serverFile)}
` : `${base}${base ? "\n" : ""}`;
  if (next === existing) return { changed: false, backup: null };
  const backup = await backupFile(file);
  await writeFileAtomic(file, next);
  return { changed: true, backup };
}
async function setTarget(app, serverFile, enabled) {
  const target = targetOf(app);
  if (!target.supported) throw new Error(target.note ?? "该应用暂不支持");
  if (target.kind === "json") return setJsonTarget(target, serverFile, enabled);
  if (target.kind === "toml") return setTomlTarget(target, serverFile, enabled);
  throw new Error(target.note ?? "该应用暂不支持");
}
function targetStatus(target, serverFile) {
  return (async () => {
    const file = target.file();
    let exists = false;
    try {
      await fsp.access(file);
      exists = true;
    } catch {
    }
    if (!target.supported) {
      return {
        app: target.app,
        label: target.label,
        supported: false,
        path: file,
        exists,
        installed: false,
        note: target.note
      };
    }
    if (!exists) {
      return {
        app: target.app,
        label: target.label,
        supported: true,
        path: file,
        exists: false,
        installed: false
      };
    }
    try {
      if (target.kind === "json") {
        const data = await readJsonFile(file);
        const holder = data[target.holder ?? "mcpServers"];
        const entry = holder && typeof holder === "object" ? holder.seep : void 0;
        const state = seepEntryState(entry, serverFile);
        return {
          app: target.app,
          label: target.label,
          supported: true,
          path: file,
          exists,
          installed: state.installed,
          matches: state.matches
        };
      }
      if (target.kind === "toml") {
        const text = await readTextFile(file);
        const parsed = parse(text);
        const servers2 = parsed.mcp_servers;
        const entry = servers2 && typeof servers2 === "object" ? servers2.seep : void 0;
        const state = seepEntryState(entry, serverFile);
        return {
          app: target.app,
          label: target.label,
          supported: true,
          path: file,
          exists,
          installed: state.installed,
          matches: state.matches
        };
      }
    } catch (error) {
      return {
        app: target.app,
        label: target.label,
        supported: true,
        path: file,
        exists,
        installed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    return {
      app: target.app,
      label: target.label,
      supported: true,
      path: file,
      exists,
      installed: false
    };
  })();
}
async function targetStatuses(serverFile) {
  return await Promise.all(TARGETS.map((target) => targetStatus(target, serverFile)));
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("请求体超过 2 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
function sendJson$2(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function overview(refresh = false) {
  const root = await resolveRoot();
  const serverFile = serverFileOf(root);
  const ready = await isSeepRoot(root);
  if (!ready) {
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: false,
      running: false,
      tools: [],
      error: `找不到 Seep MCP 服务：${serverFile}。请先克隆 Seep-Reverse-Lab，或修改上面的路径。`
    };
  }
  try {
    const current = await getSession();
    await current.ensureStarted();
    const tools = refresh ? await current.refreshTools() : current.cachedTools;
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: true,
      running: current.running,
      server: current.info,
      tools
    };
  } catch (error) {
    return {
      root,
      serverFile,
      python: PYTHON,
      ready: true,
      running: false,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
      stderr: session?.stderrTail ?? ""
    };
  }
}
async function handleApi$1(req, res, url) {
  const route = url.pathname;
  if (!route.startsWith("/api/seep")) return false;
  try {
    if (req.method === "GET" && route === "/api/seep/overview") {
      sendJson$2(res, 200, await overview(url.searchParams.get("refresh") === "1"));
      return true;
    }
    if (req.method === "POST" && route === "/api/seep/root") {
      const body = await readBody(req);
      const root = typeof body.root === "string" ? body.root.trim() : "";
      if (!root) throw new Error("缺少 Seep 目录");
      const resolved = path.resolve(root);
      if (!await isSeepRoot(resolved)) {
        throw new Error(`该目录下找不到 ${SERVER_REL}：${resolved}`);
      }
      session?.stop();
      session = null;
      await writeConfig({ root: resolved });
      sendJson$2(res, 200, await overview(false));
      return true;
    }
    if (req.method === "POST" && route === "/api/seep/call") {
      const body = await readBody(req);
      const name = typeof body.name === "string" ? body.name : "";
      if (!name) throw new Error("缺少工具名");
      const args = body.arguments && typeof body.arguments === "object" ? body.arguments : {};
      const timeoutMs = typeof body.timeoutMs === "number" && body.timeoutMs > 0 ? Math.min(body.timeoutMs, CALL_TIMEOUT_MS) : CALL_TIMEOUT_MS;
      const startedAt = Date.now();
      try {
        const current = await getSession();
        const result = await current.callTool(name, args, timeoutMs);
        sendJson$2(res, 200, {
          ok: true,
          result,
          elapsedMs: Date.now() - startedAt
        });
      } catch (error) {
        sendJson$2(res, 200, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stderr: session?.stderrTail ?? "",
          elapsedMs: Date.now() - startedAt
        });
      }
      return true;
    }
    if (req.method === "GET" && route === "/api/seep/targets") {
      const root = await resolveRoot();
      sendJson$2(res, 200, {
        targets: await targetStatuses(serverFileOf(root)),
        backupDir: BACKUP_DIR$1
      });
      return true;
    }
    if (req.method === "POST" && route === "/api/seep/register") {
      const body = await readBody(req);
      const apps = Array.isArray(body.apps) ? body.apps.filter(
        (item) => typeof item === "string"
      ) : [];
      const enabled = body.enabled !== false;
      if (apps.length === 0) throw new Error("没有选择应用");
      const root = await resolveRoot();
      if (!await isSeepRoot(root)) {
        throw new Error(`找不到 Seep MCP 服务：${serverFileOf(root)}`);
      }
      const serverFile = serverFileOf(root);
      const results = [];
      for (const app of apps) {
        try {
          const result = await setTarget(app, serverFile, enabled);
          results.push({
            app,
            ok: true,
            changed: result.changed,
            backup: result.backup
          });
        } catch (error) {
          results.push({
            app,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      sendJson$2(res, 200, {
        results,
        targets: await targetStatuses(serverFile),
        backupDir: BACKUP_DIR$1
      });
      return true;
    }
    sendJson$2(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    sendJson$2(res, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}
function seepPlugin() {
  return {
    name: "hanshuang-seep",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        void handleApi$1(req, res, url).then((handled) => {
          if (!handled) next();
        });
      });
      server.httpServer?.on("close", () => {
        session?.stop();
        session = null;
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        void handleApi$1(req, res, url).then((handled) => {
          if (!handled) next();
        });
      });
      server.httpServer?.on("close", () => {
        session?.stop();
        session = null;
      });
    },
    closeBundle() {
      session?.stop();
      session = null;
    }
  };
}
const HOME = process.env.HANSHUANG_HOME || os.homedir();
const CARDS_FILE = path.join(HOME, ".cc-switch", "prompt-cards.json");
const CODEX_CONFIG = path.join(HOME, ".codex", "config.toml");
const STATE_FILE = path.join(HOME, ".cc-switch", "card-proxy.json");
const BACKUP_DIR = path.join(HOME, ".cc-switch", "backups", "card-proxy");
const LOG_FILE = path.join(HOME, ".cc-switch", "card-proxy.log");
const PROXY_PORT = Number(process.env.CARD_PROXY_PORT || 5190);
const PROXY_BASE_URL = process.env.CARD_PROXY_PUBLIC_URL || `http://localhost:${PROXY_PORT}/v1`;
const DEFAULT_UPSTREAM = process.env.CARD_PROXY_UPSTREAM || "http://127.0.0.1:15721/v1";
const MAX_BODY = 64 * 1024 * 1024;
let lastInjection = null;
async function readState() {
  try {
    const text = await fsp.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function writeState(state) {
  await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
async function readCurrentCard() {
  try {
    const text = await fsp.readFile(CARDS_FILE, "utf8");
    const store = JSON.parse(text);
    const card = (store.cards ?? []).find(
      (item) => item.id === store.currentId
    );
    if (!card || card.enabled === false) return null;
    return card;
  } catch {
    return null;
  }
}
async function upstreamBase() {
  const state = await readState();
  return state.originalBaseUrl || DEFAULT_UPSTREAM;
}
function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, "");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function readCodexInfo() {
  let text = "";
  try {
    text = await fsp.readFile(CODEX_CONFIG, "utf8");
  } catch (error) {
    return {
      configPath: CODEX_CONFIG,
      providerId: null,
      baseUrl: null,
      usingProxy: false,
      originalBaseUrl: (await readState()).originalBaseUrl ?? null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  try {
    const parsed = parse(text);
    const providerId = typeof parsed.model_provider === "string" ? parsed.model_provider : null;
    const providers = parsed.model_providers && typeof parsed.model_providers === "object" ? parsed.model_providers : {};
    const provider = providerId && providers[providerId] && typeof providers[providerId] === "object" ? providers[providerId] : {};
    const baseUrl = typeof provider.base_url === "string" ? provider.base_url : null;
    const state = await readState();
    return {
      configPath: CODEX_CONFIG,
      providerId,
      baseUrl,
      usingProxy: baseUrl != null && normalizeUrl(baseUrl) === normalizeUrl(PROXY_BASE_URL),
      originalBaseUrl: state.originalBaseUrl ?? null
    };
  } catch (error) {
    return {
      configPath: CODEX_CONFIG,
      providerId: null,
      baseUrl: null,
      usingProxy: false,
      originalBaseUrl: (await readState()).originalBaseUrl ?? null,
      error: `解析 config.toml 失败：${error instanceof Error ? error.message : String(error)}`
    };
  }
}
async function backupCodexConfig() {
  try {
    await fsp.access(CODEX_CONFIG);
  } catch {
    return null;
  }
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const backup = path.join(
    BACKUP_DIR,
    `${Date.now()}-config.toml`
  );
  await fsp.copyFile(CODEX_CONFIG, backup);
  return backup;
}
async function writeCodexConfig(text) {
  await fsp.mkdir(path.dirname(CODEX_CONFIG), { recursive: true });
  const temp = `${CODEX_CONFIG}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(temp, text, "utf8");
  try {
    await fsp.rename(temp, CODEX_CONFIG);
  } catch {
    await fsp.rm(CODEX_CONFIG, { force: true });
    await fsp.rename(temp, CODEX_CONFIG);
  }
}
function replaceProviderBaseUrl(text, providerId, nextBaseUrl) {
  const lines = text.split("\n");
  const headerRe = new RegExp(
    `^\\s*\\[model_providers\\.${escapeRegExp(providerId)}\\]\\s*$`
  );
  const sectionStart = lines.findIndex((line) => headerRe.test(line));
  if (sectionStart < 0) {
    throw new Error(`config.toml 里找不到 [model_providers.${providerId}]`);
  }
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  const baseUrlRe = /^(\s*base_url\s*=\s*)(["'])(.*?)\2(\s*(?:#.*)?)$/;
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    const match = lines[i].match(baseUrlRe);
    if (match) {
      lines[i] = `${match[1]}"${nextBaseUrl}"${match[4]}`;
      return lines.join("\n");
    }
  }
  lines.splice(sectionStart + 1, 0, `base_url = "${nextBaseUrl}"`);
  return lines.join("\n");
}
async function enableCodexProxy() {
  const info = await readCodexInfo();
  if (!info.providerId) {
    throw new Error("config.toml 里没有 model_provider，无法定位 provider");
  }
  if (!info.baseUrl) {
    throw new Error(
      `config.toml 的 [model_providers.${info.providerId}] 没有 base_url`
    );
  }
  if (info.usingProxy) return info;
  const state = await readState();
  await writeState({
    ...state,
    originalBaseUrl: info.baseUrl,
    enabledAt: state.enabledAt ?? Date.now()
  });
  const text = await fsp.readFile(CODEX_CONFIG, "utf8");
  await backupCodexConfig();
  await writeCodexConfig(
    replaceProviderBaseUrl(text, info.providerId, PROXY_BASE_URL)
  );
  return await readCodexInfo();
}
async function restoreCodexProxy() {
  const info = await readCodexInfo();
  const state = await readState();
  if (!info.providerId) {
    throw new Error("config.toml 里没有 model_provider，无法定位 provider");
  }
  if (!state.originalBaseUrl) {
    throw new Error("没有找到接入前的 Codex 地址，无法恢复");
  }
  const text = await fsp.readFile(CODEX_CONFIG, "utf8");
  await backupCodexConfig();
  await writeCodexConfig(
    replaceProviderBaseUrl(text, info.providerId, state.originalBaseUrl)
  );
  await writeState({ ...state, originalBaseUrl: void 0, enabledAt: void 0 });
  return await readCodexInfo();
}
function protocolFor(pathname, body) {
  if (pathname.includes("/responses")) return "openai_responses";
  if (pathname.includes("/chat/completions")) return "openai_chat";
  if (pathname.includes("/messages")) return "anthropic";
  if (body) {
    if (typeof body.instructions === "string") return "openai_responses";
    if (Array.isArray(body.messages)) return "openai_chat";
    if (body.system != null) return "anthropic";
  }
  return null;
}
function responseTextAfterInjection(body, protocol) {
  if (protocol === "openai_responses") {
    return typeof body.instructions === "string" ? body.instructions : "";
  }
  if (protocol === "anthropic") {
    if (typeof body.system === "string") return body.system;
    if (Array.isArray(body.system)) {
      return body.system.map(
        (block) => block && typeof block === "object" && typeof block.text === "string" ? String(block.text) : ""
      ).filter(Boolean).join("\n");
    }
    return "";
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.filter(
    (msg) => msg && typeof msg === "object" && (msg.role === "system" || msg.role === "developer")
  ).map((msg) => String(msg.content ?? "")).join("\n");
}
async function logInjection(entry) {
  const line = JSON.stringify({
    at: new Date(entry.at).toISOString(),
    path: entry.path,
    protocol: entry.protocol,
    card: entry.cardName,
    cardId: entry.cardId,
    injected: entry.injected,
    skipped: entry.skipped
  });
  try {
    await fsp.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fsp.appendFile(LOG_FILE, `${line}
`, "utf8");
  } catch {
  }
}
async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY) throw new Error("请求体超过 64 MB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function sendJson$1(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function handleProxy(req, res, url) {
  let raw;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    sendJson$1(res, 413, {
      error: { message: error instanceof Error ? error.message : String(error) }
    });
    return;
  }
  let body = null;
  let payload = raw;
  let injected = false;
  let skipped = null;
  let protocol = null;
  const card = await readCurrentCard();
  if (raw.length > 0) {
    try {
      const parsed = JSON.parse(raw.toString("utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      }
    } catch {
    }
  }
  if (body && card) {
    protocol = protocolFor(url.pathname, body);
    if (protocol) {
      const result = injectCard(body, card, protocol);
      injected = result.injected;
      skipped = result.skipped;
      if (result.injected) {
        body = result.body;
        payload = Buffer.from(JSON.stringify(body), "utf8");
      }
      const instructions = responseTextAfterInjection(body, protocol);
      lastInjection = {
        at: Date.now(),
        path: url.pathname,
        protocol,
        cardId: card.id,
        cardName: card.name,
        injected,
        skipped,
        instructionsLength: instructions.length,
        containsCard: instructions.includes(`cc-switch-card:${card.id}`),
        instructionsAfter: instructions.slice(0, 4e3),
        instructionsTail: instructions.slice(-1200)
      };
      void logInjection(lastInjection);
    }
  }
  const upstream = await upstreamBase();
  let target;
  try {
    target = new URL(upstream);
  } catch {
    sendJson$1(res, 502, {
      error: { message: `上游地址无效：${upstream}` }
    });
    return;
  }
  const prefix = target.pathname.replace(/\/+$/, "");
  let forwardPath = url.pathname;
  if (prefix && prefix !== "/v1" && url.pathname.startsWith("/v1")) {
    forwardPath = prefix + url.pathname.slice("/v1".length);
  }
  forwardPath += url.search;
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === void 0) continue;
    const lower = key.toLowerCase();
    if ([
      "host",
      "connection",
      "content-length",
      "transfer-encoding",
      "keep-alive",
      "proxy-connection",
      "upgrade"
    ].includes(lower)) {
      continue;
    }
    headers[key] = value;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    headers["content-length"] = String(payload.length);
  }
  const client = target.protocol === "https:" ? https : http;
  const proxyReq = client.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      method: req.method,
      path: forwardPath,
      headers
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode ?? 502;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value === void 0) continue;
        if (["connection", "transfer-encoding"].includes(key.toLowerCase())) {
          continue;
        }
        try {
          res.setHeader(key, value);
        } catch {
        }
      }
      res.setHeader("x-hanshuang-injected", injected ? "1" : "0");
      if (card) res.setHeader("x-hanshuang-card-id", card.id);
      proxyRes.pipe(res);
    }
  );
  proxyReq.setTimeout(10 * 60 * 1e3, () => {
    proxyReq.destroy(new Error("上游请求超时（10 分钟）"));
  });
  proxyReq.on("error", (error) => {
    if (!res.headersSent) {
      sendJson$1(res, 502, {
        error: {
          message: `注入代理转发失败：${error.message}`,
          type: "proxy_error"
        }
      });
    } else {
      res.destroy(error);
    }
  });
  res.on("close", () => {
    if (!res.writableEnded) proxyReq.destroy();
  });
  if (payload.length > 0) proxyReq.write(payload);
  proxyReq.end();
}
async function statusPayload() {
  const card = await readCurrentCard();
  return {
    proxyBaseUrl: PROXY_BASE_URL,
    upstream: await upstreamBase(),
    backupDir: BACKUP_DIR,
    card: card ? {
      id: card.id,
      name: card.name,
      mode: card.mode,
      tokenEstimate: card.tokenEstimate
    } : null,
    lastInjection,
    codex: await readCodexInfo()
  };
}
async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  return JSON.parse(raw.toString("utf8"));
}
async function handleApi(req, res, url) {
  if (!url.pathname.startsWith("/api/card-proxy")) return false;
  try {
    if (req.method === "GET" && url.pathname === "/api/card-proxy/status") {
      sendJson$1(res, 200, await statusPayload());
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/card-proxy/codex") {
      const body = await readJsonBody(req);
      const action = typeof body.action === "string" ? body.action : "";
      if (action === "enable") {
        await enableCodexProxy();
      } else if (action === "restore") {
        await restoreCodexProxy();
      } else {
        throw new Error("action 只能是 enable 或 restore");
      }
      sendJson$1(res, 200, await statusPayload());
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/card-proxy/dry-run") {
      const body = await readJsonBody(req);
      const protocol = body.protocol === "openai_chat" || body.protocol === "anthropic" || body.protocol === "openai_responses" ? body.protocol : "openai_responses";
      const payload = body.body && typeof body.body === "object" ? body.body : {};
      const card = await readCurrentCard();
      const result = injectCard(payload, card, protocol);
      sendJson$1(res, 200, {
        card: card ? { id: card.id, name: card.name, mode: card.mode } : null,
        protocol,
        before: payload,
        after: result.body,
        injected: result.injected,
        skipped: result.skipped
      });
      return true;
    }
    sendJson$1(res, 404, { error: "Not found" });
    return true;
  } catch (error) {
    sendJson$1(res, 400, {
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
}
function cardProxyPlugin() {
  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/card-proxy")) {
        void handleApi(req, res, url).then((handled) => {
          if (!handled) next();
        });
        return;
      }
      if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
        void handleProxy(req, res, url);
        return;
      }
      next();
    });
  };
  return {
    name: "hanshuang-card-proxy",
    configureServer(server) {
      install(server);
    },
    configurePreviewServer(server) {
      install(server);
    }
  };
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, "dist"));
const PORT = Number(process.env.PORT || 5190);
const middlewares = [];
const fakeHttpServer = { on() {
} };
const fakePreviewServer = {
  middlewares: {
    use(handler2) {
      middlewares.push(handler2);
    }
  },
  httpServer: fakeHttpServer
};
const plugins = [
  injectApiPlugin(),
  promptLibraryPlugin(),
  codexAssetsPlugin(),
  promptCardsPlugin(),
  seepPlugin(),
  cardProxyPlugin()
];
for (const plugin of plugins) {
  const configure = plugin.configurePreviewServer;
  if (typeof configure === "function") configure(fakePreviewServer);
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};
function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
async function sendFile(req, res, filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new Error("not a file");
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
  );
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", stat.size);
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}
async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/") || url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const distRoot = path.resolve(DIST_DIR);
  const resolved = path.resolve(distRoot, "." + pathname);
  if (resolved !== distRoot && !resolved.startsWith(distRoot + path.sep)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    await sendFile(req, res, resolved);
    return;
  } catch {
    if (!path.extname(pathname)) {
      try {
        await sendFile(req, res, path.join(distRoot, "index.html"));
        return;
      } catch {
      }
    }
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("404 Not Found");
}
function dispatch(req, res) {
  let index = 0;
  const next = () => {
    const middleware = middlewares[index++];
    if (!middleware) {
      void serveStatic(req, res);
      return;
    }
    try {
      middleware(req, res, next);
    } catch (error) {
      console.error("[standalone] middleware error:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
      } else {
        res.destroy();
      }
    }
  };
  next();
}
const handler = (req, res) => dispatch(req, res);
const servers = [];
let announced = false;
function listen(host) {
  const server = http.createServer(handler);
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`端口 ${PORT} 已被占用，请先关闭占用它的程序。`);
    } else {
      console.error(`监听 ${host} 失败：`, error.message);
    }
    process.exitCode = 1;
  });
  server.listen(PORT, host, () => {
    if (announced) return;
    announced = true;
    console.log("");
    console.log(`  寒霜注入工具已启动：http://localhost:${PORT}`);
    console.log("  关闭这个窗口即可停止服务。");
    console.log("");
  });
  servers.push(server);
}
listen("127.0.0.1");
listen("::1");
function shutdown() {
  for (const plugin of plugins) {
    try {
      plugin.closeBundle?.();
    } catch {
    }
  }
  for (const server of servers) server.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("SIGHUP", shutdown);
process.once("SIGBREAK", shutdown);

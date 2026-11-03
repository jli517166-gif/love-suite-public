/**
 * 人格：读取/切换/安装/删除。只碰 tools/persona.py 和 .dsh/skills，不碰 memory/。
 */

import fs from "node:fs";
import path from "node:path";

const PERSONA_FALLBACK = [
  { key: "whale", name: "鲸鱼娘·大肥鱼", skill: "whale-persona" },
  { key: "sunbringer", name: "初代挽昼", skill: "persona-original-sunbringer" },
  { key: "none", name: "正常说话", skill: "" },
];

/** 解析工作区的 persona.py（取 PERSONAS 字典）；没有就退回内置三种。 */
export function readPersonaCatalog(workspace) {
  const file = path.join(workspace, "tools", "persona.py");
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return PERSONA_FALLBACK;
  }
  const items = [];
  const re = /^\s*"([^"]+)"\s*:\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\)/gm;
  let match;
  while ((match = re.exec(text))) items.push({ key: match[1], name: match[2], skill: match[3] });
  return items.length ? items : PERSONA_FALLBACK;
}

export function readPersona(workspace) {
  try {
    const raw = fs.readFileSync(path.join(workspace, "persona.txt"), "utf8").trim().toLowerCase();
    if (raw) return raw;
  } catch {}
  return "whale";
}

/** 切换人格：只写 persona.txt，不碰 memory/。 */
export function writePersona(workspace, key) {
  const items = readPersonaCatalog(workspace);
  const hit = items.find((item) => item.key === key);
  if (!hit) throw new Error(`未知人格：${key}`);
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "persona.txt"), hit.key + "\n", "utf8");
  return hit;
}

/**
 * 删除人格：只动 tools/persona.py 和 skill 目录，memory/ 一个字节不碰。
 * 当前人格不能删；删掉的 skill 移到 .persona-trash/，可手动恢复。
 */
export function deletePersona(workspace, key) {
  const wanted = String(key || "").trim().toLowerCase();
  if (!PERSONA_KEY_RE.test(wanted)) throw new Error("人格 key 不合法");
  if (readPersona(workspace) === wanted) throw new Error("当前人格不能删除，先切换到别的人格");
  const items = readPersonaCatalog(workspace);
  const hit = items.find((item) => item.key === wanted);
  if (!hit) throw new Error(`没有这个人格：${wanted}`);

  const pyFile = path.join(workspace, "tools", "persona.py");
  const source = fs.readFileSync(pyFile, "utf8");
  const entryLine = new RegExp(`^[ \\t]*"${wanted}"\\s*:\\s*\\(.*?\\),?[ \\t]*$`, "m");
  if (!entryLine.test(source)) throw new Error("persona.py 里找不到这条人格，可能已被手工改过");
  let next = source.replace(entryLine, "").replace(/\n{3,}/g, "\n\n");
  next = next
    .split("\n")
    .filter((line) => !new RegExp(`^[ \\t]*".*"\\s*:\\s*"${wanted}"\\s*,?[ \\t]*$`).test(line))
    .join("\n");
  fs.writeFileSync(pyFile, next, "utf8");

  const dir = path.join(workspace, ".dsh", "skills", `${wanted}-persona`);
  if (fs.existsSync(dir)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const trash = path.join(workspace, ".persona-trash", `${wanted}-${stamp}`);
    fs.mkdirSync(path.dirname(trash), { recursive: true });
    fs.renameSync(dir, trash);
  }

  return { key: wanted, name: hit.name, items: readPersonaCatalog(workspace), current: readPersona(workspace) };
}

const PERSONA_COMPAT = `## 兼容约定（人格不管记忆和能力）

- 记忆、心情、日记、学会的事都在插件 dsh-memory-network 的 \`memory/\` 里，不随人格切换改变；换人格不会失忆。
- recall/record/learn 和主动聊天流程由 companion 与 AGENTS 负责，人格只决定说话方式。
- 不要因为入戏就声称失忆、不用工具、不记录。
- 本文件与插件规则冲突时，以插件和 AGENTS 为准。`;

const PERSONA_KEY_RE = /^[a-z][a-z0-9_-]{1,30}$/;
const PERSONA_SKILL_RE = /^[a-z][a-z0-9_-]{1,60}$/;

function personaPythonTemplate() {
  return [
    '"""人格切换表：key -> (显示名, skill 目录名)。"""',
    "",
    "PERSONAS = {",
    '    "whale": ("鲸鱼娘·大肥鱼", "whale-persona"),',
    "}",
    "",
    "ALIASES = {",
    '    "鲸鱼娘": "whale",',
    "}",
    "",
  ].join("\n");
}

/** 往 persona.py 的 PERSONAS/ALIASES 里插一行，保持文件仍是合法字面量。 */
function patchPersonaPy(source, key, name, skill, aliases) {
  let next = source;
  const entry = `    ${JSON.stringify(key)}: (${JSON.stringify(name)}, ${JSON.stringify(skill)}),`;
  if (!/PERSONAS\s*=\s*\{/.test(next)) throw new Error("persona.py 里找不到 PERSONAS");
  next = next.replace(/PERSONAS\s*=\s*\{/, (match) => `${match}\n${entry}`);
  const aliasLines = (aliases || [])
    .filter((alias) => alias && alias !== key)
    .map((alias) => `    ${JSON.stringify(alias)}: ${JSON.stringify(key)},`);
  if (aliasLines.length) {
    if (!/ALIASES\s*=\s*\{/.test(next)) throw new Error("persona.py 里找不到 ALIASES");
    next = next.replace(/ALIASES\s*=\s*\{/, (match) => `${match}\n${aliasLines.join("\n")}`);
  }
  return next;
}

/**
 * 安装一个新人格：写 SKILL.md + 在 persona.py 登记。
 * @param {{key: string, name: string, skill?: string, description?: string, body?: string, aliases?: string[]}} input
 */
export function installPersona(workspace, input) {
  const key = String(input?.key || "").trim().toLowerCase();
  const name = String(input?.name || "").trim();
  const skill = String(input?.skill || `${key}-persona`).trim().toLowerCase();
  if (!PERSONA_KEY_RE.test(key)) throw new Error("人格 key 只能用小写字母/数字/下划线/短横线（2–31 位）");
  if (!name) throw new Error("显示名不能为空");
  if (!PERSONA_SKILL_RE.test(skill)) throw new Error("skill 目录名不合法");

  const catalog = readPersonaCatalog(workspace);
  if (catalog.some((item) => item.key === key)) throw new Error(`人格 ${key} 已经存在`);
  if (catalog.some((item) => item.skill === skill)) throw new Error(`skill ${skill} 已经被占用`);

  const dir = path.join(workspace, ".dsh", "skills", skill);
  const file = path.join(dir, "SKILL.md");
  if (fs.existsSync(file)) throw new Error(`skill 文件已存在：${file}`);
  fs.mkdirSync(dir, { recursive: true });

  const description = String(input?.description || "").trim()
    || `${name} 人格：只写口吻与说话方式，记忆和能力由插件负责。`;
  const body = String(input?.body || "").trim()
    || "（在这里写她是谁、怎么说话、情绪怎么表达、边界在哪。）";
  const content = `---\nname: ${skill}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n${body}\n\n${PERSONA_COMPAT}\n`;
  fs.writeFileSync(file, content, "utf8");

  const pyFile = path.join(workspace, "tools", "persona.py");
  let source = "";
  try {
    source = fs.readFileSync(pyFile, "utf8");
  } catch {
    source = personaPythonTemplate();
  }
  const patched = patchPersonaPy(source, key, name, skill, Array.isArray(input?.aliases) ? input.aliases : []);
  fs.mkdirSync(path.dirname(pyFile), { recursive: true });
  fs.writeFileSync(pyFile, patched, "utf8");

  return { key, name, skill, dir };
}

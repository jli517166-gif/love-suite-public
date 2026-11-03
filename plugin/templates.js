/**
 * 模板管理：默认模板在 compose.js，用户的自定义模板落盘到
 * `<workspace>/memory/templates.json`。
 *
 * 语义（故意做得简单）：
 * - 按 key（活动 id / 心情名）覆盖：自定义非空就用自定义，否则回默认。
 * - 删除到空 = 取消覆盖，回到默认。
 * - 新增第一条时，先把默认列表复制过来再追加，避免「加一条就只剩一条」。
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ACTIVITY_LINES, DEFAULT_EMOTION_LINES } from "./compose.js";

export const TEMPLATE_KINDS = ["activity", "emotion"];

const DEFAULTS = {
  activity: DEFAULT_ACTIVITY_LINES,
  emotion: DEFAULT_EMOTION_LINES,
};

/** 模板文件路径（跟着工作区走）。 */
export function templatePath(workspace) {
  return path.join(String(workspace || ""), "memory", "templates.json");
}

/** 读自定义模板；文件不存在或坏掉都当空。 */
export function readCustomTemplates(workspace) {
  try {
    const data = JSON.parse(fs.readFileSync(templatePath(workspace), "utf8"));
    return {
      activity: data?.activity && typeof data.activity === "object" ? data.activity : {},
      emotion: data?.emotion && typeof data.emotion === "object" ? data.emotion : {},
    };
  } catch {
    return { activity: {}, emotion: {} };
  }
}

function writeCustomTemplates(workspace, data) {
  const file = templatePath(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return data;
}

/** 生效模板：自定义非空覆盖默认。 */
export function effectiveTemplates(workspace) {
  const custom = readCustomTemplates(workspace);
  const out = { activity: {}, emotion: {} };
  for (const kind of TEMPLATE_KINDS) {
    for (const [key, lines] of Object.entries(DEFAULTS[kind])) {
      const own = custom[kind][key];
      out[kind][key] = Array.isArray(own) && own.length ? own.slice() : lines.slice();
    }
  }
  return out;
}

/** 面板一次拿全：默认、自定义、生效。 */
export function templateSnapshot(workspace) {
  return {
    defaults: DEFAULTS,
    custom: readCustomTemplates(workspace),
    effective: effectiveTemplates(workspace),
  };
}

function assertKindKey(kind, key) {
  if (!TEMPLATE_KINDS.includes(kind)) throw new Error(`未知模板类型：${kind}`);
  if (!DEFAULTS[kind][key]) throw new Error(`未知模板 key：${kind}/${key}`);
}

/** 取得可编辑的当前列表（自定义优先，否则复制默认）。 */
function editableLines(custom, kind, key) {
  const own = custom[kind][key];
  if (Array.isArray(own) && own.length) return own.slice();
  return DEFAULTS[kind][key].slice();
}

function cleanText(text) {
  const value = String(text || "").trim();
  if (!value) throw new Error("模板内容不能为空");
  if (value.length > 200) throw new Error("模板太长（最多 200 字）");
  return value;
}

/**
 * 新增一条模板。
 * @returns {object} 最新快照
 */
export function addTemplate(workspace, kind, key, text) {
  assertKindKey(kind, key);
  const value = cleanText(text);
  const custom = readCustomTemplates(workspace);
  const lines = editableLines(custom, kind, key);
  if (lines.includes(value)) throw new Error("这条模板已经有了");
  lines.push(value);
  custom[kind][key] = lines;
  writeCustomTemplates(workspace, custom);
  return templateSnapshot(workspace);
}

/** 修改第 index 条。 */
export function updateTemplate(workspace, kind, key, index, text) {
  assertKindKey(kind, key);
  const value = cleanText(text);
  const custom = readCustomTemplates(workspace);
  const lines = editableLines(custom, kind, key);
  const at = Number(index);
  if (!Number.isInteger(at) || at < 0 || at >= lines.length) throw new Error("模板序号越界");
  if (lines.some((line, i) => line === value && i !== at)) throw new Error("这条模板已经有了");
  lines[at] = value;
  custom[kind][key] = lines;
  writeCustomTemplates(workspace, custom);
  return templateSnapshot(workspace);
}

/** 删除第 index 条；删空就取消覆盖、回到默认。 */
export function removeTemplate(workspace, kind, key, index) {
  assertKindKey(kind, key);
  const custom = readCustomTemplates(workspace);
  const lines = editableLines(custom, kind, key);
  const at = Number(index);
  if (!Number.isInteger(at) || at < 0 || at >= lines.length) throw new Error("模板序号越界");
  lines.splice(at, 1);
  if (lines.length) custom[kind][key] = lines;
  else delete custom[kind][key];
  writeCustomTemplates(workspace, custom);
  return templateSnapshot(workspace);
}

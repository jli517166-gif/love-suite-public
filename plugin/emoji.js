/**
 * QQ 表情手册（QQ face handbook）。
 *
 * 问题：dsh-onebot-qq 默认把 QQ 小黄脸按「顺序」映射成 Unicode emoji
 * （微笑(14) → 🥰、崇拜(318) → 🦓、比心(319) → 🦌），id 丢掉以后模型只能瞎猜。
 * 解决：
 *   1) `patches/patch-onebot-face-ids.mjs` 让通道把 face 段渲染成 `[QQ表情:id]`；
 *   2) 本模块拿 `emoji/qq-faces.json` 把标记就地注解成
 *      `[QQ表情:14 微笑｜礼貌、疏远或无语的笑，不是开心]`；
 *   3) love-companion 在 `agent/pre-step` 里对 love 工作区的入站消息自动调用它。
 *
 * 纯函数 + 只读数据，不依赖宿主 API，方便单独测试。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE_FILE = path.join(HERE, "emoji", "qq-faces.json");

/** 通道渲染出来的原始标记：`[QQ表情:14]`。已注解过的不会再命中（数字后面不是 `]`）。 */
export const MARKER_RE = /\[QQ表情:([0-9]{1,6})\]/g;

/** 未收录 id 的兜底说明。 */
const UNKNOWN_NOTE = "未收录，可能是新版 QQ 表情，按上下文理解";

let cache;

/** 懒加载手册；文件缺失/损坏时退化成空表，绝不让聊天因为表情挂掉。 */
export function handbook() {
  if (cache !== undefined) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(TABLE_FILE, "utf8"));
    const faces = raw && typeof raw.faces === "object" && raw.faces !== null ? raw.faces : {};
    cache = { version: raw?.version ?? 0, updated: raw?.updated ?? "", faces };
  } catch {
    cache = { version: 0, updated: "", faces: {} };
  }
  return cache;
}

/** 手册条目数。 */
export function faceCount() {
  return Object.keys(handbook().faces).length;
}

/**
 * 按 id 查一条表情。
 * @param {string|number} id QQ 表情 id（OneBot face id / QSid）
 * @returns {{id: string, name: string, note: string, pack: string} | undefined}
 */
export function findFace(id) {
  const key = String(id ?? "").trim();
  if (!/^[0-9]{1,6}$/.test(key)) return undefined;
  const entry = handbook().faces[key];
  if (!entry) return undefined;
  return {
    id: key,
    name: String(entry.name ?? ""),
    note: String(entry.note ?? ""),
    pack: String(entry.pack ?? ""),
  };
}

/**
 * 把一个 id 渲染成模型可读的注解。
 * 形如 `[QQ表情:14 微笑｜礼貌、疏远或无语的笑，不是开心]`。
 */
export function gloss(id) {
  const face = findFace(id);
  if (!face) return `[QQ表情:${String(id ?? "").trim()} ${UNKNOWN_NOTE}]`;
  const label = face.pack ? `${face.name}（${face.pack}）` : face.name;
  const note = face.note ? `｜${face.note}` : "";
  return `[QQ表情:${face.id} ${label}${note}]`;
}

/**
 * 把一段文本里的所有 `[QQ表情:id]` 就地注解。
 * @param {string} text
 * @returns {{text: string, ids: string[], unknown: string[]}}
 */
export function annotateMarkers(text) {
  const source = String(text ?? "");
  const ids = [];
  const unknown = [];
  if (!source.includes("[QQ表情:")) return { text: source, ids, unknown };
  const next = source.replace(MARKER_RE, (_match, rawId) => {
    const id = String(rawId);
    ids.push(id);
    if (!findFace(id)) unknown.push(id);
    return gloss(id);
  });
  return { text: next, ids, unknown };
}

/**
 * 按 id 或名字搜索手册。
 * @param {string} query 纯数字按 id 精确匹配；否则按名称/表情包子串匹配
 * @param {number} limit 最多返回条数
 * @returns {Array<{id: string, name: string, note: string, pack: string}>}
 */
export function searchFaces(query, limit = 12) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const max = Math.max(1, Math.min(50, Number(limit) || 12));
  if (/^[0-9]{1,6}$/.test(q)) {
    const hit = findFace(q);
    return hit ? [hit] : [];
  }
  const needle = q.toLowerCase();
  const out = [];
  const faces = handbook().faces;
  for (const id of Object.keys(faces).sort((a, b) => Number(a) - Number(b))) {
    const face = findFace(id);
    if (!face) continue;
    if (face.name.toLowerCase().includes(needle) || face.pack.toLowerCase().includes(needle) || face.note.includes(q)) {
      out.push(face);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** 一条表情的可读描述（工具输出用）。 */
export function describeFace(face) {
  const pack = face.pack ? `（${face.pack}）` : "";
  const note = face.note ? `｜${face.note}` : "";
  return `${face.id} ${face.name}${pack}${note}`;
}

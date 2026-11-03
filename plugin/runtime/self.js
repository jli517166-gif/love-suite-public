/** runtime/self — extracted behavior; dependencies are explicit ESM imports. */
import { installPersona } from "../persona.js";
import { lovePaths, readJson, defaults } from "./storage.js";
import { readCurrentProfile } from "./learning.js";
import { readPulse } from "./pulse-store.js";
import { journalEntries } from "./journal.js";
import fs from "node:fs";
import path from "node:path";

export function distillPersona(workspace, input = {}) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("蒸馏人格需要显示名");
  const sections = [
    ["身份", input.identity],
    ["说话方式", input.voice],
    ["在意的事", input.values],
    ["边界", input.boundaries],
  ].filter(([, value]) => String(value || "").trim());
  const quotes = Array.isArray(input.quotes)
    ? input.quotes
        .map((quote) => String(quote).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  if (!sections.length && !quotes.length) throw new Error("至少给一段身份/口吻/在意/边界/口头禅");

  const body =
    sections.map(([title, value]) => `## ${title}\n\n${String(value).trim()}`).join("\n\n") +
    (quotes.length ? `\n\n## 口头禅\n\n${quotes.map((quote) => `- ${quote}`).join("\n")}` : "");

  const result = installPersona(workspace, {
    key: String(input.key || "")
      .trim()
      .toLowerCase(),
    name,
    description: String(input.description || "").trim() || `${name} 人格（蒸馏自对话材料）`,
    body,
    aliases: input.aliases,
  });

  // 自我叙事还是空的，就写一段种子，避免"换了人格但不知道自己是谁"
  try {
    if (!selfExcerpt(workspace)) {
      writeSelf(workspace, String(input.identity || `我是${name}。`).trim());
    }
  } catch {}

  return { ...result, sections: sections.length, quotes: quotes.length };
}

export const SELF_AUTO_MARK = "<!-- auto -->";

export function autoSelfSection(workspace) {
  const profile = readCurrentProfile(workspace);
  const rel = readJson(lovePaths(workspace).relationship, defaults(workspace).relationship);
  const mood = readJson(lovePaths(workspace).mood, {});
  const pulse = readPulse(workspace);
  const name = profile.nickname || profile.name || "还没问到名字";
  const journal = journalEntries(workspace, 7).slice(-3);
  const lines = [
    `和${name}的关系：${rel.stage}（好感 ${rel.affection}／信任 ${rel.trust}）。`,
    Array.isArray(profile.likes) && profile.likes.length ? `喜欢的：${profile.likes.join("、")}。` : "",
    Array.isArray(profile.dislikes) && profile.dislikes.length ? `不喜欢的：${profile.dislikes.join("、")}。` : "",
    Array.isArray(profile.boundaries) && profile.boundaries.length
      ? `不能碰的边界：${profile.boundaries.join("、")}。`
      : "",
    journal.length ? `最近的事：\n${journal.map((e) => `- ${e.date} ${e.text.slice(0, 80)}`).join("\n")}` : "",
    `此刻：${pulse.activity?.label || "发呆"}，心情 ${mood.emotion || "平静"}。`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function ensureSelf(workspace) {
  const file = lovePaths(workspace).self;
  const auto = autoSelfSection(workspace);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {}
  if (!text.trim()) {
    text = `# 我是谁\n\n（这段由我自己写，插件不会覆盖。）\n\n${SELF_AUTO_MARK}\n## 现在\n${auto}\n`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
    return text;
  }
  const idx = text.indexOf(SELF_AUTO_MARK);
  if (idx < 0) return text; // 用户自己写的格式，不硬改
  const nextText = `${text.slice(0, idx)}${SELF_AUTO_MARK}\n## 现在\n${auto}\n`;
  if (nextText !== text) fs.writeFileSync(file, nextText, "utf8");
  return nextText;
}

export function writeSelf(workspace, narrative) {
  const auto = autoSelfSection(workspace);
  const text = `# 我是谁\n\n${String(narrative || "").trim()}\n\n${SELF_AUTO_MARK}\n## 现在\n${auto}\n`;
  const file = lovePaths(workspace).self;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return text;
}

export function selfExcerpt(workspace, max = 400, readOnly = false) {
  try {
    const text = readOnly ? fs.readFileSync(lovePaths(workspace).self, "utf8") : ensureSelf(workspace);
    const idx = text.indexOf(SELF_AUTO_MARK);
    const head = idx > 0 ? text.slice(0, idx) : text;
    const body = head
      .replace(/^#.*$/m, "")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.includes("（这段由我自己写"))
      .join("\n")
      .trim();
    return body ? body.slice(0, max) : "";
  } catch {
    return "";
  }
}

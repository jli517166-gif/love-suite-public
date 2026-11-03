/** runtime/learning — extracted behavior; dependencies are explicit ESM imports. */
import { readCoreMemory } from "../core-memory.js";
import { currentLearning, currentProfile, assertLegacyWriteAllowed } from "../legacy-memory.js";
import { lovePaths, readJson, defaults, writeJson, localIso } from "./storage.js";

export const LEARNING_MAX = 200;

export function readLearning(workspace, { raw = false } = {}) {
  const data = readJson(lovePaths(workspace).learning, null);
  const store = data && Array.isArray(data.items) ? data : { items: [] };
  return raw ? store : { ...store, items: currentLearning(store.items, readCoreMemory(workspace)) };
}

export function readCurrentProfile(workspace) {
  return currentProfile(readJson(lovePaths(workspace).profile, defaults(workspace).profile), readCoreMemory(workspace));
}

export function writeLearning(workspace, data) {
  writeJson(lovePaths(workspace).learning, data);
  return data;
}

export function learnSkill(workspace, input, now = new Date()) {
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("love_learn: name 不能为空");
  const note = String(input?.note || "").trim();
  const source = String(input?.source || "self").trim();
  const date = localIso(now);
  assertLegacyWriteAllowed(readCoreMemory(workspace), { type: "learning", name: name.toLowerCase() });
  const data = readLearning(workspace, { raw: true });
  const key = name.toLowerCase();
  const existing = data.items.find((item) => String(item.name).toLowerCase() === key);
  if (existing) {
    if (note) existing.note = note;
    existing.date = date;
    existing.times = Number(existing.times || 1) + 1;
    writeLearning(workspace, data);
    return existing;
  }
  const entry = { id: "sk_" + Date.now().toString(36), name, note, source, date, times: 1 };
  data.items.push(entry);
  if (data.items.length > LEARNING_MAX) data.items = data.items.slice(-LEARNING_MAX);
  writeLearning(workspace, data);
  return entry;
}

export function recentSkills(workspace, limit = 5) {
  return readLearning(workspace).items.slice(-Math.max(1, limit)).reverse();
}

export const TEACH_HINTS = [
  /我教你/,
  /教你/,
  /记住/,
  /以后(你)?(可以|要|就)/,
  /学会/,
  /学一下/,
  /方法是/,
  /步骤是/,
  /你可以用/,
];

export function learnFromText(workspace, text, now = new Date()) {
  const raw = String(text || "").trim();
  if (raw.length < 6) return null;
  if (!TEACH_HINTS.some((re) => re.test(raw))) return null;
  if (/[?？]\s*$/.test(raw) && !/记住|教你/.test(raw)) return null;
  const sentence =
    raw
      .split(/[。！!？?\n]/)
      .map((part) => part.trim())
      .find((part) => part && TEACH_HINTS.some((re) => re.test(part))) || raw;
  const name = sentence
    .replace(/^[，,、\s]+/, "")
    .replace(/^你?(要|可以)?(记住|学会)?[：:，,\s]*/, "")
    .slice(0, 28)
    .trim();
  if (!name) return null;
  return learnSkill(workspace, { name, note: raw.slice(0, 140), source: "auto" }, now);
}

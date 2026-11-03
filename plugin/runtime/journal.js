/** runtime/journal — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import path from "node:path";
import { lovePaths, localIso, readJson } from "./storage.js";

export function journalEntries(workspace, days = 7) {
  const p = lovePaths(workspace);
  const out = [];
  const entries = [];
  for (const dir of [p.journal, path.join(p.journal, "archive")]) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) entries.push({ dir, name });
      }
    } catch {}
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  for (const entry of entries) {
    const day = entry.name.slice(0, 10);
    if (day < cutoff) continue;
    let text = "";
    try {
      text = fs.readFileSync(path.join(entry.dir, entry.name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s+(.*)$/);
      if (m) out.push({ date: day, text: m[1].trim() });
    }
  }
  return out;
}

export function maybeArchiveJournal(workspace, keepDays = 365) {
  const p = lovePaths(workspace);
  const today = localIso().slice(0, 10);
  const marker = path.join(p.journal, ".archived-at");
  try {
    if (fs.readFileSync(marker, "utf8").trim() === today) return { moved: 0 };
  } catch {}
  const cutoff = new Date(Date.now() - Math.max(1, keepDays) * 86400000).toISOString().slice(0, 10);
  let moved = 0;
  try {
    const names = fs.readdirSync(p.journal).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name));
    for (const name of names) {
      if (name.slice(0, 10) >= cutoff) continue;
      const archive = path.join(p.journal, "archive");
      fs.mkdirSync(archive, { recursive: true });
      fs.renameSync(path.join(p.journal, name), path.join(archive, name));
      moved += 1;
    }
    fs.mkdirSync(p.journal, { recursive: true });
    fs.writeFileSync(marker, today + "\n", "utf8");
  } catch {}
  return { moved };
}

export function appendJournal(workspace, text, tag) {
  const p = lovePaths(workspace);
  fs.mkdirSync(p.journal, { recursive: true });
  const day = localIso().slice(0, 10);
  const file = path.join(p.journal, day + ".md");
  const stamp = localIso().slice(11, 16);
  const line = `- ${stamp} ${text}${tag ? `（${tag}）` : ""}`;
  let lines = [];
  try {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  } catch {}
  // 读进来通常以 \n 结尾，split 会留一个空串；不丢掉的话每写一条就多一行空行
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) lines = [`# ${day}`, ""];
  if (lines.length > 2) lines.push("");
  lines.push(line);
  if (lines.length > 200) lines = lines.slice(0, 2).concat(lines.slice(-198));
  fs.writeFileSync(file, lines.join("\n").replace(/\n+$/, "") + "\n", "utf8");
  return line;
}

export function recentLife(workspace) {
  const p = lovePaths(workspace);
  const out = [];
  let text = "";
  try {
    text = fs.readFileSync(p.life, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && entry.text) out.push(entry);
    } catch {}
  }
  return out.slice(-40);
}

export function appendLife(workspace, text, mood) {
  const p = lovePaths(workspace);
  fs.mkdirSync(path.dirname(p.life), { recursive: true });
  const entry = { date: localIso(), text: String(text).slice(0, 240), mood: mood || "平静" };
  fs.appendFileSync(p.life, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export function netEpisodes(workspace) {
  const p = lovePaths(workspace);
  const data = readJson(p.net, {});
  return Array.isArray(data.episodes) ? data.episodes.filter((e) => e && e.text) : [];
}

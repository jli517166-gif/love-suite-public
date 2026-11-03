/** runtime/activity — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import path from "node:path";
import { localIso, lovePaths } from "./storage.js";

export function logActivity(workspace, previousPulse, nextPulse) {
  const next = nextPulse?.activity;
  if (!next) return;
  const previous = previousPulse?.activity;
  if (previous && previous.id === next.id && previous.since === next.since) return;
  const file = lovePaths(workspace).activity;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = JSON.stringify({
    date: localIso(),
    id: next.id,
    label: next.label,
    since: next.since,
    until: next.until,
  });
  let lines = [];
  try {
    lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  } catch {}
  lines.push(line);
  if (lines.length > 300) lines = lines.slice(-300);
  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
}

export function recentActivities(workspace, days = 1) {
  const file = lovePaths(workspace).activity;
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.date && entry.date.slice(0, 10) >= cutoff && entry.label) out.push(entry);
    } catch {}
  }
  return out;
}

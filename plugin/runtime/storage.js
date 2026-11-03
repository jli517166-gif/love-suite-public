/** runtime/storage — extracted behavior; dependencies are explicit ESM imports. */
import path from "node:path";
import { DEFAULT_LOVE } from "./environment.js";
import fs from "node:fs";

export function localIso() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

export function localIsoAfter(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

export function lovePaths(workspace) {
  const root = workspace || DEFAULT_LOVE;
  const mem = path.join(root, "memory");
  return {
    root,
    mem,
    profile: path.join(mem, "profile.json"),
    relationship: path.join(mem, "relationship.json"),
    state: path.join(mem, "state.json"),
    mood: path.join(mem, "mood.json"),
    life: path.join(mem, "life.jsonl"),
    journal: path.join(mem, "journal"),
    net: path.join(mem, "net.json"),
    pulse: path.join(mem, "pulse.json"),
    outbox: path.join(mem, "outbox.jsonl"),
    self: path.join(mem, "self.md"),
    activity: path.join(mem, "activity.jsonl"),
    stickers: path.join(mem, "stickers.json"),
    stickerDir: path.join(mem, "stickers"),
    learning: path.join(mem, "learning.json"),
  };
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function defaults(workspace) {
  return {
    profile: {
      name: null,
      nickname: null,
      birthday: null,
      likes: [],
      dislikes: [],
      boundaries: [],
      facts: {},
      notes: [],
    },
    relationship: {
      stage: "初识",
      affection: 5,
      trust: 5,
      mood: "平静",
      milestones: [],
      feeling_log: [],
      last_feeling_date: null,
      today_delta: 0,
    },
    state: { created_at: localIso(), last_seen: null, message_count: 0 },
    mood: {
      emotion: "平静",
      valence: 0,
      arousal: 0.2,
      intensity: 0.3,
      causes: [],
      updated: localIso(),
    },
  };
}

export function moodDefault() {
  return {
    emotion: "平静",
    valence: 0,
    arousal: 0.2,
    intensity: 0.3,
    causes: [],
    updated: localIso(),
    last_triggered: null,
  };
}

/** runtime/mood — extracted behavior; dependencies are explicit ESM imports. */
import { localIso, lovePaths, readJson, writeJson, defaults, moodDefault } from "./storage.js";
import { appraise } from "../appraisal.js";
import { onInteraction } from "../pulse.js";
import { readPulse, writePulse } from "./pulse-store.js";
import { journalEntries } from "./journal.js";

export const EMOTIONS = {
  开心: [0.7, 0.5],
  兴奋: [0.85, 0.75],
  平静: [0.0, 0.2],
  害羞: [0.35, 0.55],
  想念: [-0.1, 0.45],
  不安: [-0.4, 0.6],
  难过: [-0.65, 0.3],
  委屈: [-0.5, 0.35],
  生气: [-0.5, 0.8],
};

export function stageOf(affection) {
  const n = Number(affection) || 0;
  return n >= 81 ? "恋人" : n >= 61 ? "心动" : n >= 41 ? "亲近" : n >= 21 ? "熟悉" : "初识";
}

export function applyFeeling(workspace, delta, reason) {
  const p = lovePaths(workspace);
  const rel = readJson(p.relationship, defaults(workspace).relationship);
  const today = localIso().slice(0, 10);
  if (rel.last_feeling_date !== today) {
    rel.last_feeling_date = today;
    rel.today_delta = 0;
  }
  const used = Number(rel.today_delta) || 0;
  let d = Math.trunc(Number(delta) || 0);
  d = d > 0 ? Math.min(d, Math.max(0, 2 - used)) : Math.max(d, -5);
  if (!d) return { delta: 0, relationship: rel };

  rel.affection = Math.max(0, Math.min(100, Number(rel.affection || 0) + d));
  rel.today_delta = used + d;
  rel.stage = stageOf(rel.affection);
  rel.feeling_log = (rel.feeling_log || []).slice(-49).concat({
    date: today,
    delta: d,
    reason: String(reason || "").slice(0, 120),
  });
  writeJson(p.relationship, rel);
  recomputeMood(workspace, true);
  return { delta: d, relationship: rel };
}

export const AUTO_APPRAISAL_COOLDOWN_MS = 15 * 60000;

export function autoAppraise(workspace, text, now = Date.now()) {
  const judged = appraise(text);
  if (!judged.delta) return null;
  const p = lovePaths(workspace);
  const state = readJson(p.state, defaults(workspace).state);
  const last = Date.parse(String(state.auto_appraisal_at || ""));
  if (Number.isFinite(last) && now - last < AUTO_APPRAISAL_COOLDOWN_MS) return null;

  const applied = applyFeeling(workspace, judged.delta, `自动评估：${judged.phrase ?? judged.tag}`);
  if (!applied.delta) return { delta: 0, reason: "daily-cap" };
  state.auto_appraisal_at = localIso();
  writeJson(p.state, state);
  return { delta: applied.delta, stage: applied.relationship.stage, phrase: judged.phrase };
}

export const FACT_ALIASES = {
  称呼: "nickname",
  昵称: "nickname",
  名字: "nickname",
  姓名: "nickname",
  生日: "birthday",
  喜欢: "likes",
  喜好: "likes",
  偏好: "likes",
  兴趣: "likes",
  讨厌: "dislikes",
  不喜欢: "dislikes",
  反感: "dislikes",
  边界: "boundaries",
  忌讳: "boundaries",
  雷区: "boundaries",
};

export const PROFILE_ARRAYS = new Set(["likes", "dislikes", "boundaries"]);

export const PROFILE_SCALARS = new Set(["nickname", "name", "birthday"]);

export function applyFact(profile, rawKey, value) {
  const key = String(rawKey ?? "").trim();
  const text = String(value ?? "").trim();
  const field = FACT_ALIASES[key] || key;
  if (PROFILE_ARRAYS.has(field)) {
    const list = Array.isArray(profile[field]) ? profile[field] : [];
    if (!list.includes(text)) list.push(text);
    profile[field] = list;
  } else if (PROFILE_SCALARS.has(field)) {
    profile[field] = text;
  } else {
    profile.facts = profile.facts && typeof profile.facts === "object" ? profile.facts : {};
    profile.facts[field] = text;
  }
  return { key, field, value: text };
}

export function touchState(workspace, count = 1) {
  const p = lovePaths(workspace);
  const state = readJson(p.state, defaults(workspace).state);
  state.last_seen = localIso();
  state.message_count = Math.max(0, Number(state.message_count) || 0) + Math.max(1, count);
  writeJson(p.state, state);
  // 真聊上了：依恋回落一截（心跳自己的账）
  try {
    writePulse(workspace, onInteraction(readPulse(workspace)));
  } catch {}
  return state;
}

export function decayMood(mood) {
  const last = Date.parse(String(mood.updated || ""));
  const hours = Number.isFinite(last) ? Math.max(0, (Date.now() - last) / 3600000) : 0;
  const factor = Math.pow(0.5, hours / 6);
  mood.intensity = Math.max(0.15, Number(mood.intensity || 0.3) * factor);
  if (mood.intensity <= 0.18) {
    mood.emotion = "平静";
    mood.valence = 0;
    mood.arousal = 0.2;
    mood.intensity = 0.3;
    mood.causes = ["之前的情绪已逐渐平复"];
  }
  mood.updated = localIso();
  return mood;
}

export function loadMood(workspace) {
  const p = lovePaths(workspace);
  const mood = readJson(p.mood, moodDefault());
  return decayMood(mood);
}

export function moodLine(mood) {
  const causes = (mood.causes || []).slice(-2).join("；");
  return `心情：${mood.emotion}（强度 ${Number(mood.intensity || 0).toFixed(2)}）` + (causes ? ` — ${causes}` : "");
}

export function saveMood(workspace, mood) {
  const p = lovePaths(workspace);
  mood.updated = localIso();
  writeJson(p.mood, mood);
  const rel = readJson(p.relationship, defaults(workspace).relationship);
  rel.mood = mood.emotion || "平静";
  writeJson(p.relationship, rel);
}

export function recomputeMood(workspace, force = false, random = Math.random) {
  const p = lovePaths(workspace);
  const mood = decayMood(readJson(p.mood, moodDefault()));
  const lastTrigger = Date.parse(String(mood.last_triggered || ""));
  const needsMigration = mood.reason_schema !== 2;
  if (!force && !needsMigration && Number.isFinite(lastTrigger) && Date.now() - lastTrigger < 45 * 60000) return mood;
  if (!force && !needsMigration && random() < 0.45) return mood;

  const journal = journalEntries(workspace, 3)
    .map((e) => e.text)
    .join("\n");
  const rel = readJson(p.relationship, defaults(workspace).relationship);
  const state = readJson(p.state, defaults(workspace).state);
  const recentCutoff = Date.now() - 3 * 86400000;
  const feelings = (Array.isArray(rel.feeling_log) ? rel.feeling_log : [])
    .filter((item) => {
      const at = Date.parse(String(item.date || ""));
      return Number.isFinite(at) && at >= recentCutoff;
    })
    .slice(-5);
  const feelingSum = feelings.reduce((sum, item) => sum + Number(item.delta || 0), 0);
  const lastSeen = Date.parse(String(state.last_seen || ""));
  // 还没见过面（last_seen 为空）不算「沉默」；旧版按 999 小时算，会凭空冒出「有一阵子没说话了」
  const hasSeen = Number.isFinite(lastSeen);
  const hoursSince = hasSeen ? (Date.now() - lastSeen) / 3600000 : 0;
  const hour = new Date().getHours();

  // Each emotion carries only the evidence which actually supports it.
  const weights = Object.fromEntries(Object.keys(EMOTIONS).map((name) => [name, name === "平静" ? 30 : 0]));
  const evidence = new Map();
  const add = (emotion, amount, reason) => {
    weights[emotion] = (weights[emotion] || 0) + amount;
    if (!reason) return;
    const reasons = evidence.get(emotion) || [];
    reasons.push(reason);
    evidence.set(emotion, reasons);
  };
  const positiveJournal = journal.replace(/不喜欢|不开心|不可爱|没有陪着|不想抱/g, "");
  const positive = positiveJournal.match(/[^\n]*(夸|喜欢|约定|答应|抱抱|摸摸|陪着|可爱)[^\n]*/);
  if (positive) {
    const reason = positive[0].slice(0, 80);
    add("开心", 18, reason);
    add("害羞", 6, reason);
    add("兴奋", 4, reason);
  }
  const negative = journal.match(/[^\n]*(没回|冷落|失约|忽略|被凶|凶我)[^\n]*/);
  if (negative) {
    const reason = negative[0].slice(0, 80);
    add("难过", 12, reason);
    add("委屈", 10, reason);
    add("不安", 6, reason);
  }
  const boundary = journal.match(/[^\n]*(越界|踩.{0,4}边界|侵犯.{0,4}边界|不要这样|讨厌我)[^\n]*/);
  if (boundary) add("生气", 16, boundary[0].slice(0, 80));
  const longing = journal.match(/[^\n]*(想你|好久没|久没|想念)[^\n]*/);
  if (longing) add("想念", 14, longing[0].slice(0, 80));
  if (feelingSum > 0) add("开心", 10, "最近的互动让好感有所增长");
  if (feelingSum < 0) {
    add("难过", 8, "最近的互动让关系有些受挫");
    add("委屈", 6, "最近的互动让关系有些受挫");
  }
  if (hasSeen && hoursSince > 12) {
    add("想念", 18, "有一阵子没说话了");
    add("不安", 4, "已经超过十二小时没有互动");
  }
  if (hour < 6 || hour >= 22) add("想念", 6, "夜深时更容易想起对方");
  else if (hour < 9) add("平静", 8, "清晨，情绪较平缓");
  // An existing emotion may linger, but never inherit a legacy mismatched cause.
  if (
    !needsMigration &&
    Number.isFinite(lastTrigger) &&
    Date.now() - lastTrigger < 6 * 3600000 &&
    mood.emotion !== "平静" &&
    Array.isArray(mood.causes) &&
    mood.causes.length
  ) {
    for (const reason of mood.causes.slice(0, 2)) add(mood.emotion, 6, reason);
  }
  if (evidence.size) weights["平静"] = Math.max(10, weights["平静"] * 0.35);

  const names = Object.keys(weights);
  const total = names.reduce((sum, name) => sum + weights[name], 0);
  let roll = random() * total;
  let picked = "平静";
  for (const name of names) {
    roll -= weights[name];
    if (roll <= 0) {
      picked = name;
      break;
    }
  }
  const [valence, arousal] = EMOTIONS[picked] || EMOTIONS["平静"];
  mood.emotion = picked;
  mood.valence = valence;
  mood.arousal = arousal;
  const causes = evidence.get(picked) || (picked === "平静" ? ["当前没有明显的情绪波动"] : []);
  mood.intensity = Math.max(0.15, Math.min(1, (picked === "平静" ? 0.25 : 0.45) + random() * 0.3));
  mood.causes = Array.from(new Set(causes.filter(Boolean))).slice(0, 2);
  mood.reason_schema = 2;
  mood.last_triggered = localIso();
  saveMood(workspace, mood);
  return mood;
}

export function moodContextLine(workspace) {
  const mood = recomputeMood(workspace);
  const emotion = String(mood.emotion || "平静");
  const intensity = Number(mood.intensity ?? 0.3);
  const causes = (Array.isArray(mood.causes) ? mood.causes : []).filter(Boolean).slice(-2).join("；");
  const because = causes ? `｜因为：${causes}` : "";
  return `当前心情：${emotion}（强度 ${intensity.toFixed(2)}）${because}。语气按这个来，不要直接报心情。`;
}

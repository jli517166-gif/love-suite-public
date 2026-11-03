/**
 * 给「身体」（AIRI）的状态快照：只读，不改记忆，0 token。
 *
 * 和 bridge/love-state.mjs 的 JSON 保持同一套字段，方便身体侧只认一种格式：
 * emotion / motion / intensity / valence / arousal / doing / needs / presence / call
 */

import fs from "node:fs";
import path from "node:path";

const EMOTION_TO_AIRI = {
  开心: "happy",
  兴奋: "happy",
  平静: "neutral",
  害羞: "awkward",
  想念: "think",
  不安: "awkward",
  难过: "sad",
  委屈: "sad",
  生气: "angry",
};

const AIRI_MOTION = {
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  think: "Think",
  surprised: "Surprise",
  awkward: "Awkward",
  question: "Question",
  curious: "Curious",
  neutral: "Idle",
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function localIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

function presenceOf(state, now) {
  const last = Date.parse(String(state?.last_seen || ""));
  if (!Number.isFinite(last)) return { activity: "unknown", speaking: false, secondsSinceLastEvent: null };
  const seconds = Math.max(0, Math.round((now - last) / 1000));
  return {
    activity: seconds <= 10 ? "speaking" : seconds <= 120 ? "chatting" : "idle",
    speaking: seconds <= 10,
    secondsSinceLastEvent: seconds,
  };
}

/**
 * 生成 AIRI 可直接消费的状态。
 * @param {string} workspace love 工作区
 * @param {number} [now] 时间戳（测试用）
 */
export function buildAiriState(workspace, now = Date.now()) {
  const mem = path.join(String(workspace || ""), "memory");
  const mood = readJson(path.join(mem, "mood.json"), {});
  const rel = readJson(path.join(mem, "relationship.json"), {});
  const state = readJson(path.join(mem, "state.json"), {});
  const profile = readJson(path.join(mem, "profile.json"), {});
  const pulse = readJson(path.join(mem, "pulse.json"), {});
  const emotion = String(mood.emotion || "平静");
  const airi = EMOTION_TO_AIRI[emotion] || "neutral";
  const needs = pulse && pulse.needs ? pulse.needs : null;

  return {
    updated: localIso(new Date(now)),
    source: "dsh-memory-network",
    emotion: airi,
    motion: AIRI_MOTION[airi],
    intensity: Number(mood.intensity ?? 0.3),
    valence: Number(mood.valence ?? 0),
    arousal: Number(mood.arousal ?? 0.2),
    moodRaw: {
      emotion,
      valence: mood.valence,
      arousal: mood.arousal,
      intensity: mood.intensity,
      causes: mood.causes || [],
    },
    relationship: {
      stage: rel.stage || "初识",
      affection: Number(rel.affection ?? 5),
      trust: Number(rel.trust ?? 5),
    },
    presence: presenceOf(state, now),
    doing: pulse?.activity?.label ?? null,
    needs: needs
      ? {
          attachment: Number(needs.attachment ?? 0),
          curiosity: Number(needs.curiosity ?? 0),
          energy: Number(needs.energy ?? 0),
        }
      : null,
    call: profile.nickname || profile.name || null,
    meta: {
      lastSeen: state.last_seen || null,
      messageCount: Number(state.message_count ?? 0),
    },
  };
}

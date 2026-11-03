#!/usr/bin/env node
/**
 * love → AIRI 状态桥（原型）。
 *
 * 只读 love 的记忆文件，把「她此刻的状态」暴露成一个 HTTP 接口，供身体（AIRI）
 * 轮询。不调模型、不写任何记忆，跑一天也是 0 token。
 *
 *   GET /state   -> 情绪/关系/在场/活动 的 JSON
 *   GET /health  -> { ok: true }
 *
 * 用法：
 *   node love-state.mjs                 # 起服务，默认 127.0.0.1:8765
 *   node love-state.mjs --port 9000
 *   node love-state.mjs --once          # 只打印一次当前状态，不起服务
 *
 * 默认读 ~/love，可用 --workspace 或 LOVE_WORKSPACE 覆盖。
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const WORKSPACE = path.resolve(argOf("workspace", process.env.LOVE_WORKSPACE || path.join(os.homedir(), "love")));
const PORT = Number(argOf("port", process.env.LOVE_STATE_PORT || 8790));
const HOST = argOf("host", "127.0.0.1");
const MEM = path.join(WORKSPACE, "memory");

/** love 的九种心情 → AIRI 的九种情绪（AIRI: happy/sad/angry/think/surprised/awkward/question/curious/neutral）。 */
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

/** AIRI 的动作名（stage-ui 的 EMOTION_EmotionMotionName_value，留给身体侧参考）。 */
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

function localIso(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

/** 找到 love 会话的最新写入时间（用来推断「她正在说话/刚聊完/发呆」）。 */
function latestSessionMtime() {
  const root = path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "sessions");
  let latest = 0;
  let stack = [root];
  let guard = 0;
  while (stack.length && guard++ < 20000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 只扫 love 工作区的会话目录，别把别的会话算进来
        if (!entry.name.includes("love") && dir === root) continue;
        stack.push(full);
      } else if (entry.name === "session.v4.jsonl.zstd") {
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > latest) latest = m;
        } catch {}
      }
    }
  }
  return latest;
}

function activityOf(sessionMtime) {
  if (!sessionMtime) return { activity: "unknown", speaking: false, secondsAgo: null };
  const secondsAgo = Math.max(0, Math.round((Date.now() - sessionMtime) / 1000));
  const speaking = secondsAgo <= 10;
  const activity = speaking ? "speaking" : secondsAgo <= 120 ? "chatting" : "idle";
  return { activity, speaking, secondsAgo };
}

function buildState() {
  const mood = readJson(path.join(MEM, "mood.json"), {});
  const rel = readJson(path.join(MEM, "relationship.json"), {});
  const state = readJson(path.join(MEM, "state.json"), {});
  const profile = readJson(path.join(MEM, "profile.json"), {});
  const pulse = readJson(path.join(MEM, "pulse.json"), {});
  const emotion = String(mood.emotion || "平静");
  const airi = EMOTION_TO_AIRI[emotion] || "neutral";
  const { activity, speaking, secondsAgo } = activityOf(latestSessionMtime());
  const needs = pulse && pulse.needs ? pulse.needs : null;

  return {
    updated: localIso(),
    source: "love-companion",
    // 给身体直接用
    emotion: airi,
    motion: AIRI_MOTION[airi],
    intensity: Number(mood.intensity ?? 0.3),
    valence: Number(mood.valence ?? 0),
    arousal: Number(mood.arousal ?? 0.2),
    // 给调试/字幕用
    moodRaw: { emotion, valence: mood.valence, arousal: mood.arousal, intensity: mood.intensity, causes: mood.causes || [] },
    relationship: {
      stage: rel.stage || "初识",
      affection: Number(rel.affection ?? 5),
      trust: Number(rel.trust ?? 5),
    },
    presence: {
      activity,
      speaking,
      secondsSinceLastEvent: secondsAgo,
    },
    // 她一个人时在做什么 / 有多想你（心跳写的，没开就是 null）
    doing: pulse?.activity?.label ?? null,
    needs: needs
      ? {
          attachment: Number(needs.attachment ?? 0),
          curiosity: Number(needs.curiosity ?? 0),
          energy: Number(needs.energy ?? 0),
        }
      : null,
    // 只放称呼，别把整个 profile 暴露出去
    call: profile.nickname || profile.name || null,
    meta: { lastSeen: state.last_seen || null, messageCount: Number(state.message_count ?? 0) },
  };
}

function sendJson(res, data, status = 200) {
  const body = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

if (args.includes("--once")) {
  console.log(JSON.stringify(buildState(), null, 2));
} else {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://${HOST}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      });
      res.end();
      return;
    }
    if (url.pathname === "/state") return sendJson(res, buildState());
    if (url.pathname === "/health") return sendJson(res, { ok: true, workspace: WORKSPACE });
    sendJson(res, { ok: false, error: "not found" }, 404);
  });
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(`端口 ${PORT} 已被占用，换一个：node love-state.mjs --port 8791`);
      process.exit(1);
    }
    throw error;
  });
  server.listen(PORT, HOST, () => {
    console.log(`love-state bridge: http://${HOST}:${PORT}/state  (workspace: ${WORKSPACE})`);
  });
}

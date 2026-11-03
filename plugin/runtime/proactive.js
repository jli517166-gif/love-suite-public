/** runtime/proactive — extracted behavior; dependencies are explicit ESM imports. */
import { localIso, lovePaths, readJson } from "./storage.js";
import { readProactive, writeProactive, readPulse } from "./pulse-store.js";
import { activityPhrase, impulseOf } from "../pulse.js";
import { readRuntimeConfig, effectiveConfig } from "./config.js";
import { recomputeMood } from "./mood.js";
import { journalEntries, recentLife, netEpisodes } from "./journal.js";
import { minutesSinceContact } from "./contact.js";
import { enqueue, pickDeliverable, removeIntent, newIntentId } from "../outbox.js";
import { createChannel } from "../channels/qq.js";
import { composeLine } from "../compose.js";
import { effectiveTemplates } from "../templates.js";
import { DEFAULT_LOVE } from "./environment.js";

export function hashKey(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function takeVoiceCue(workspace, cfg) {
  const chance = Number(cfg.voiceChance ?? 0);
  if (!(chance > 0)) return false;
  const hour = new Date().getHours();
  const start = Number(cfg.activeStartHour ?? 10);
  const end = Number(cfg.activeEndHour ?? 22);
  if (hour < start || hour >= end) return false;
  const state = readProactive(workspace);
  const last = Date.parse(String(state.last_voice_at || ""));
  const cooldown = Number(cfg.voiceCooldownHours ?? 8) * 3600000;
  if (Number.isFinite(last) && Date.now() - last < cooldown) return false;
  if (Math.random() >= chance) return false;
  state.last_voice_at = localIso();
  writeProactive(workspace, state);
  return true;
}

export function choosePrompt(workspace, state, allowVoice = true, rawCfg) {
  const mood = recomputeMood(workspace);
  const emotion = mood.emotion || "平静";
  const intensity = Number(mood.intensity || 0.3);
  const causes = (mood.causes || []).slice(-2).join("；");
  const recent = new Set(state.recent || []);
  const shared = new Set(state.shared_life || []);
  const journal = journalEntries(workspace, 7).filter((e) => !recent.has(hashKey(e.text)));
  const episodes = netEpisodes(workspace).filter((e) => !recent.has(hashKey(e.text)));
  const life = recentLife(workspace).filter((e) => !shared.has(hashKey(e.text)));

  // Random category first, then random item — no fixed 70/20/10 weights.
  const groups = { memory: [], mood: [], life: [], now: [] };
  for (const e of journal.slice(-8)) {
    groups.memory.push([
      hashKey(e.text),
      `你想起 ${e.date} 的事：${e.text.slice(0, 70)}。想顺着这件事主动问一句，或者提一句你记得。`,
    ]);
  }
  for (const e of episodes.slice(-4)) {
    groups.memory.push([
      hashKey(e.text),
      `你想起之前的一件事：${String(e.text).slice(0, 70)}。想自然地问问后来怎么样了。`,
    ]);
  }
  if (intensity >= 0.35 && emotion !== "平静") {
    groups.mood.push([
      hashKey("mood:" + emotion + causes),
      `你现在有点${emotion}${causes ? "，因为" + causes : ""}。想主动找主人说句话，把这点心情自然带出来。`,
    ]);
  }
  for (const e of life.slice(-6)) {
    groups.life.push([
      hashKey(e.text),
      `你今天有件小事：${String(e.text).slice(0, 60)}。想随口跟主人提一句，不要变成日报。`,
    ]);
  }
  // 此刻在做什么（心跳给的），让"她一个人时也在活着"有具体内容
  const pulse = readPulse(workspace);
  const phrase = activityPhrase(pulse);
  if (phrase) {
    const key = hashKey(`now:${pulse.activity?.id ?? ""}:${pulse.activity?.since ?? ""}`);
    groups.now.push([key, `${phrase}，想随口跟主人说一句现在的状态，别变成汇报。`]);
  }
  const kinds = Object.keys(groups).filter((k) => groups[k].length > 0);
  if (!kinds.length) return null;
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const pool = groups[kind];
  const picked = pool[Math.floor(Math.random() * pool.length)];
  const voice = allowVoice ? takeVoiceCue(workspace, effectiveConfig(rawCfg || readRuntimeConfig())) : false;
  const prompt = `（内心：${picked[1]} 主动找主人说句话，1~2 句，像随手发消息；别提这条提示，别说“记忆/系统”，也别汇报你今天做了什么。可以配一张表情包。${voice ? "这次可以顺手发一条语音。" : ""}）`;
  return { kind, key: picked[0], prompt, voice };
}

export function localIsoOf(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

export function nextRandomSlot(cfg) {
  const now = new Date();
  const start = new Date();
  start.setHours(cfg.activeStartHour, 0, 0, 0);
  const end = new Date();
  end.setHours(cfg.activeEndHour, 0, 0, 0);
  let lo = Math.max(now.getTime() + 20 * 60000, start.getTime());
  let hi = end.getTime();
  if (lo >= hi) {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
    lo = start.getTime();
    hi = end.getTime();
  }
  return new Date(lo + Math.random() * (hi - lo));
}

export function ensureNextAt(state, cfg, workspace) {
  const existing = Date.parse(String(state.next_at || ""));
  if (Number.isFinite(existing) && Date.now() - existing < 3 * 3600000) return existing;
  const slot = nextRandomSlot(cfg);
  state.next_at = localIsoOf(slot);
  writeProactive(workspace, state);
  return slot.getTime();
}

export async function eligible(workspace, cfg) {
  const state = readProactive(workspace);
  if (!state.next_after && state.last_sent) {
    const last = Date.parse(String(state.last_sent));
    if (Number.isFinite(last)) {
      const gap = cfg.minGapHours + Math.random() * Math.max(0, cfg.maxGapHours - cfg.minGapHours);
      state.next_after = localIsoOf(new Date(last + gap * 3600000));
      writeProactive(workspace, state);
    }
  }
  if (state.next_after) {
    const after = Date.parse(String(state.next_after));
    if (Number.isFinite(after) && Date.now() < after) return [false, "gap"];
  }

  const today = localIso().slice(0, 10);
  if (state.skip_date === today) return [false, "skipped-today"];
  const dates = Array.isArray(state.dates) ? state.dates : [];
  const dayCount = Number(state.day_counts?.[today] || 0);
  if (dayCount >= Math.max(1, Number(cfg.maxPerDay ?? 1))) return [false, "already-today"];
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  if (dates.filter((d) => d >= weekStart).length >= cfg.maxPerWeek) return [false, "week-cap"];
  if (minutesSinceContact(workspace) < cfg.quietAfterChatMinutes) return [false, "recent-chat"];

  // 冲动驱动：真的想得厉害就不等随机窗口（仍然只在活跃时段、且不越过间隔/上限）
  const pulse = readPulse(workspace);
  const impulse = impulseOf(pulse?.needs || {});
  const hour = new Date().getHours();
  const start = Number(cfg.activeStartHour ?? 10);
  const end = Number(cfg.activeEndHour ?? 22);

  const target = ensureNextAt(state, cfg, workspace);
  if (Date.now() < target) return [false, "waiting"];
  if (Date.now() - target > 3 * 3600000) {
    state.next_at = null;
    writeProactive(workspace, state);
    return [false, "missed"];
  }
  // 心跳参与决策：越是想你，越不容易"今天算了"
  const eagerness = Number(pulse?.needs?.attachment ?? 0);
  const impulseBoost = impulse >= 0.8 ? 0.55 : 1;
  const skipChance = Math.min(
    0.95,
    Math.max(0, Number(cfg.dailySkipChance ?? 0.45) * (eagerness > 0.7 ? 0.5 : 1) * impulseBoost),
  );
  if (Math.random() < skipChance) {
    state.skip_date = today;
    state.next_at = null;
    writeProactive(workspace, state);
    return [false, "random-skip"];
  }
  return [true, "random-slot"];
}

export async function deliverIntent(workspace, channel, intent) {
  let online = false;
  try {
    online = await channel.available();
  } catch {
    online = false;
  }
  if (!online) {
    enqueue(workspace, intent);
    return { delivered: false, reason: "channel-offline" };
  }
  try {
    await channel.deliver(intent);
    return { delivered: true, reason: "delivered" };
  } catch (err) {
    enqueue(workspace, intent);
    return { delivered: false, reason: `deliver-failed: ${err?.message ?? err}` };
  }
}

export async function drainOutbox(workspace, channel, cfg = {}) {
  const hour = new Date().getHours();
  const start = Number(cfg.activeStartHour ?? 10);
  const end = Number(cfg.activeEndHour ?? 22);
  if (hour < start || hour >= end) return { delivered: false, reason: "quiet-hours" };

  try {
    if (!(await channel.available())) return { delivered: false, reason: "channel-offline" };
  } catch {
    return { delivered: false, reason: "channel-offline" };
  }
  const pending = pickDeliverable(workspace);
  if (!pending) return { delivered: false, reason: "empty" };

  // 她想说话之后你们又聊上了 → 这句已经过时，丢掉
  const state = readJson(lovePaths(workspace).state, {});
  const lastSeen = Date.parse(String(state.last_seen || ""));
  const created = Date.parse(String(pending.createdAt || ""));
  if (Number.isFinite(lastSeen) && Number.isFinite(created) && lastSeen > created) {
    removeIntent(workspace, pending.id);
    return { delivered: false, reason: "stale" };
  }

  try {
    await channel.deliver(pending);
    removeIntent(workspace, pending.id);
    return { delivered: true, reason: "outbox", intent: pending };
  } catch (err) {
    return { delivered: false, reason: `deliver-failed: ${err?.message ?? err}` };
  }
}

export async function deliverWithFallback(eff, workspace, intent, agents) {
  const channel = createChannel({ ...eff, workspace }, { agents });
  if (channel.id === "qq" && !eff.qqHttpUrl && !intent?.groupId) {
    const web = createChannel({ ...eff, channel: "web", workspace }, { agents });
    let webOk = false;
    try {
      webOk = await web.available();
    } catch {}
    if (webOk) {
      try {
        await web.deliver({ text: intent.text });
        return { delivered: true, reason: "web-fallback" };
      } catch {}
    }
  }
  return deliverIntent(workspace, channel, intent);
}

export async function runProactive(ctx, cfg, workspace) {
  const eff = effectiveConfig(cfg);
  if (!eff.proactiveEnabled) return { ok: false, reason: "disabled" };
  const ws = workspace || eff.workspace || DEFAULT_LOVE;
  const channel = createChannel({ ...eff, workspace: ws }, { agents: ctx?.agents });

  // 1) 通道回来了：先把积压的意图补发掉，别让「她刚想说的话」烂在箱子里
  const drained = await drainOutbox(ws, channel, eff);
  if (drained.delivered) {
    ctx.logger?.info?.(`love-companion: outbox delivered (${drained.intent?.id})`);
    return { ok: true, reason: "outbox" };
  }

  // 2) 正常调度（不再检查通道：离线也要把意图生成出来，投递失败进发件箱）
  const [ok, reason] = await eligible(ws, eff);
  if (!ok) return { ok: false, reason };
  const state = readProactive(ws);
  const picked = choosePrompt(ws, state, true, cfg);
  if (!picked) return { ok: false, reason: "no-topic" };

  const mood = readJson(lovePaths(ws).mood, {});
  const pulse = readPulse(ws);
  // 能直接发就直接说人话（省掉一整轮模型调用）；否则把"内心提示"交给 agent
  const line = eff.composeEnabled === false ? "" : composeLine(pulse, mood, { templates: effectiveTemplates(ws) });
  const intent = {
    id: newIntentId(),
    text: picked.prompt,
    line,
    kind: picked.kind,
    key: picked.key,
    voice: Boolean(picked.voice),
    emotion: String(mood.emotion || "平静"),
    priority: "low",
    createdAt: localIso(),
  };

  if (eff.groupProactive && Array.isArray(eff.groupIds) && eff.groupIds.length) {
    intent.groupId = String(eff.groupIds[Math.floor(Math.random() * eff.groupIds.length)]);
  }
  const delivery = await deliverWithFallback(eff, ws, intent, ctx?.agents);

  // 3) 不管投递还是排队，调度状态都推进，避免排队期间反复生成
  state.last_sent = localIso();
  const gap = eff.minGapHours + Math.random() * Math.max(0, eff.maxGapHours - eff.minGapHours);
  state.next_after = localIsoOf(new Date(Date.now() + gap * 3600000));
  state.next_at = null;
  state.dates = (Array.isArray(state.dates) ? state.dates : []).slice(-30).concat(localIso().slice(0, 10));
  state.day_counts = {
    ...(state.day_counts || {}),
    [localIso().slice(0, 10)]: Number(state.day_counts?.[localIso().slice(0, 10)] || 0) + 1,
  };
  const dayCutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  for (const key of Object.keys(state.day_counts)) if (key < dayCutoff) delete state.day_counts[key];
  state.recent = (Array.isArray(state.recent) ? state.recent : []).slice(-20).concat(picked.key);
  writeProactive(ws, state);
  ctx.logger?.info?.(
    `love-companion: proactive ${delivery.delivered ? "injected" : "queued"} (${reason}; channel=${channel.id})`,
  );
  return { ok: true, reason: delivery.delivered ? reason : `queued-${delivery.reason}` };
}

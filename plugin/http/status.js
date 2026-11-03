/** http/status — extracted behavior; dependencies are explicit ESM imports. */
import fs from "node:fs";
import { createChannel } from "../channels/qq.js";
import { outboxStats } from "../outbox.js";
import { reflectionStatus } from "../reflection.js";
import { reflectionLimits } from "../reflection-worker.js";
import { DEFAULT_LOVE } from "../runtime/environment.js";
import { hostState } from "../runtime/host-state.js";
import { currentStarUrl } from "./star.js";
import { localIso, lovePaths, readJson, defaults } from "../runtime/storage.js";
import { soulWorkspaces, effectiveConfig } from "../runtime/config.js";
import { readProactive, readPulse } from "../runtime/pulse-store.js";
import { recomputeMood } from "../runtime/mood.js";
import { pluginVersion } from "../runtime/doctor.js";

export function statusPayload(baseCfg) {
  const eff = effectiveConfig(baseCfg);
  const workspace = eff.workspace || DEFAULT_LOVE;
  const list = soulWorkspaces(eff);
  const state = readProactive(workspace);
  const mood = recomputeMood(workspace);
  return {
    ok: true,
    version: pluginVersion(),
    workspace: eff.workspace || DEFAULT_LOVE,
    workspaces: list,
    setupDone: fs.existsSync(lovePaths(workspace).profile),
    workspaceExists: fs.existsSync(workspace),
    proactiveEnabled: Boolean(eff.proactiveEnabled),
    config: {
      minGapHours: Number(eff.minGapHours ?? 4),
      maxGapHours: Number(eff.maxGapHours ?? 12),
      dailySkipChance: Number(eff.dailySkipChance ?? 0.45),
      activeStartHour: Number(eff.activeStartHour ?? 10),
      activeEndHour: Number(eff.activeEndHour ?? 22),
      voiceChance: Number(eff.voiceChance ?? 0.08),
      voiceCooldownHours: Number(eff.voiceCooldownHours ?? 8),
      quietAfterChatMinutes: Number(eff.quietAfterChatMinutes ?? 120),
      // 功能开关（面板和插件管理里都能看见/切换）
      emojiEnabled: eff.emojiEnabled !== false,
      moodInjection: eff.moodInjection !== false,
      autoAppraisal: eff.autoAppraisal !== false,
      composeEnabled: eff.composeEnabled !== false,
      autoLearn: eff.autoLearn !== false,
      reflectionEnabled: eff.reflectionEnabled !== false,
      reflectionBackgroundEnabled: eff.reflectionBackgroundEnabled !== false,
      reflectionCooldownMinutes: reflectionLimits(eff).cooldownMinutes,
      reflectionMaxCallsPerDay: reflectionLimits(eff).maxCallsPerDay,
      reflectionMaxOutputTokens: reflectionLimits(eff).maxOutputTokens,
      groupProactive: eff.groupProactive === true,
      groupIds: Array.isArray(eff.groupIds) ? eff.groupIds : [],
      groupContextMessages: Number(eff.groupContextMessages ?? 20),
      channel: String(eff.channel || "qq"),
    },
    mood,
    state,
    relationship: readJson(lovePaths(workspace).relationship, defaults(workspace).relationship),
    pulse: readPulse(workspace),
    channel: (() => {
      const channel = createChannel(eff);
      return { id: channel.id, describe: channel.describe() };
    })(),
    outbox: outboxStats(workspace),
    reflection: (() => {
      try {
        return reflectionStatus(workspace);
      } catch {
        return { error: "整理队列读取失败，未自动重置" };
      }
    })(),
    reflectionWorker: hostState.reflectionWorkerRef?.describe(workspace) || {
      enabled: false,
      phase: "unavailable",
      reason: "后台执行器尚未启动",
    },
    reflectionCapture: hostState.reflectionCaptureRef?.describe(workspace) || null,
    starUrl: currentStarUrl(),
    now: localIso(),
  };
}

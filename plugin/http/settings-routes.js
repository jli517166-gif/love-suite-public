/** settings HTTP routes. Return true only after handling the request. */
import { sendJson, readRequestBody } from "./transport.js";
import { setupStatus } from "../setup.js";
import { repairSetup } from "../setup-repair.js";
import { RUNTIME_CONFIG, effectiveConfig, readRuntimeConfig } from "../runtime/config.js";
import { DEFAULT_LOVE } from "../runtime/environment.js";
import { doctorReport } from "../runtime/doctor.js";
import { writeJson } from "../runtime/storage.js";
import { hostState } from "../runtime/host-state.js";
import { statusPayload } from "./status.js";
import fs from "node:fs";
import path from "node:path";
import { readProactive, writeProactive } from "../runtime/pulse-store.js";

export async function handleSettingsRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "GET" && route === "/setup") {
    sendJson(res, await setupStatus(eff, ws));
    return true;
  }

  if (req.method === "POST" && route === "/setup/repair") {
    const body = await readRequestBody(req);
    if (String(body?.confirm || "") !== "REPAIR") {
      throw new Error("一键修复需要确认：confirm 必须是 REPAIR");
    }
    const report = repairSetup({
      workspace: String(body?.workspace || ws),
      runtimePath: RUNTIME_CONFIG,
      napcatDir: String(body?.napcatDir || eff.napcatDir || ""),
      botQQ: body?.botQQ || eff.botQQ,
      ownerQQ: body?.ownerQQ || eff.ownerQQ,
      qqPort: Number(body?.qqPort || eff.qqPort || 8643),
      httpPort: Number(body?.httpPort || 0),
      token: String(body?.token || eff.qqHttpToken || ""),
      channel: String(body?.channel || eff.channel || "qq"),
    });
    const refreshed = effectiveConfig(baseCfg);
    sendJson(res, { ok: true, report, setup: await setupStatus(refreshed, refreshed.workspace || DEFAULT_LOVE) });
    return true;
  }

  if (req.method === "GET" && route === "/doctor") {
    sendJson(res, { ok: true, text: await doctorReport(ws, baseCfg) });
    return true;
  }

  if (req.method === "POST" && route === "/config") {
    const body = await readRequestBody(req);
    const next = { ...readRuntimeConfig() };
    if (typeof body.proactiveEnabled === "boolean") next.proactiveEnabled = body.proactiveEnabled;
    for (const flag of [
      "emojiEnabled",
      "moodInjection",
      "autoAppraisal",
      "composeEnabled",
      "autoLearn",
      "reflectionEnabled",
      "reflectionBackgroundEnabled",
    ]) {
      if (typeof body[flag] === "boolean") next[flag] = body[flag];
    }
    if (typeof body.groupProactive === "boolean") next.groupProactive = body.groupProactive;
    if (typeof body.groupMemoryEnabled === "boolean") next.groupMemoryEnabled = body.groupMemoryEnabled;
    if (Array.isArray(body.groupIds)) {
      const groups = [];
      for (const raw of body.groupIds) {
        const id = String(raw || "").trim();
        if (!id) continue;
        if (!/^[1-9][0-9]{4,11}$/.test(id)) throw new Error(`群号不合法：${id}`);
        if (!groups.includes(id)) groups.push(id);
      }
      next.groupIds = groups;
    }
    if (typeof body.workspace === "string" && body.workspace.trim()) {
      const candidate = body.workspace.trim();
      if (!fs.existsSync(candidate)) throw new Error("工作区路径不存在");
      const resolved = path.resolve(candidate);
      if (resolved === path.parse(resolved).root) throw new Error("工作区不能是磁盘根目录");
      if (!fs.existsSync(path.join(resolved, "memory"))) throw new Error("不是 love 工作区（缺 memory/ 目录）");
      next.workspace = resolved;
    }
    if (Array.isArray(body.workspaces)) {
      const cleaned = [];
      for (const item of body.workspaces) {
        if (typeof item !== "string" || item.trim() === "") continue;
        const candidate = item.trim();
        if (!fs.existsSync(candidate)) throw new Error(`工作区不存在：${candidate}`);
        if (!fs.existsSync(path.join(candidate, "memory"))) throw new Error(`工作区缺少 memory/：${candidate}`);
        if (!cleaned.includes(candidate)) cleaned.push(candidate);
      }
      next.workspaces = cleaned;
    }
    const numberFields = {
      reflectionCooldownMinutes: [1, 1440],
      reflectionMaxCallsPerDay: [1, 24],
      reflectionMaxOutputTokens: [512, 8192],
      minGapHours: [1, 72],
      maxGapHours: [1, 72],
      dailySkipChance: [0, 1],
      activeStartHour: [0, 23],
      activeEndHour: [1, 24],
      voiceChance: [0, 1],
      voiceCooldownHours: [1, 168],
      quietAfterChatMinutes: [0, 1440],
      maxPerWeek: [1, 50],
      groupContextMessages: [0, 100],
    };
    for (const [key, [min, max]] of Object.entries(numberFields)) {
      if (body[key] === undefined) continue;
      const value = Number(body[key]);
      if (!Number.isFinite(value)) throw new Error(`${key} 必须是数字`);
      next[key] = Math.min(max, Math.max(min, value));
    }
    if (body.activeStartHour !== undefined || body.activeEndHour !== undefined) {
      const st = readProactive(ws);
      st.next_at = null;
      writeProactive(ws, st);
    }
    // 通道与 NapCat 连接参数（安装向导用）
    if (typeof body.channel === "string" && ["qq", "web", "none"].includes(body.channel)) {
      next.channel = body.channel;
    }
    if (typeof body.qqHost === "string" && body.qqHost.trim()) next.qqHost = body.qqHost.trim();
    for (const [key, max] of [["qqPort", 65535]]) {
      if (body[key] === undefined) continue;
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${key} 不是有效端口`);
      next[key] = Math.trunc(value);
    }
    if (typeof body.qqHttpUrl === "string") next.qqHttpUrl = body.qqHttpUrl.trim();
    if (typeof body.qqHttpToken === "string") next.qqHttpToken = body.qqHttpToken.trim();
    if (typeof body.napcatDir === "string" && body.napcatDir.trim()) next.napcatDir = body.napcatDir.trim();
    writeJson(RUNTIME_CONFIG, next);
    hostState.reflectionWorkerRef?.reconcile();
    sendJson(res, statusPayload(baseCfg));
    return true;
  }
  return false;
}

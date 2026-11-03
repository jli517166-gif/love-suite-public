/** companion HTTP routes. Return true only after handling the request. */
import { sendJson, readRequestBody } from "./transport.js";
import { statusPayload } from "./status.js";
import { recomputeMood } from "../runtime/mood.js";
import { readPulse, readProactive } from "../runtime/pulse-store.js";
import { readJson, lovePaths, defaults, localIso } from "../runtime/storage.js";
import { outboxStats, newIntentId } from "../outbox.js";
import { createChannel } from "../channels/qq.js";
import { readPersona } from "../persona.js";
import { readLearning } from "../runtime/learning.js";
import { readStickers } from "../runtime/stickers.js";
import fs from "node:fs";
import path from "node:path";
import { hostState } from "../runtime/host-state.js";
import { pluginVersion } from "../runtime/doctor.js";
import { soulWorkspaces } from "../runtime/config.js";
import { buildAiriState } from "../airi-state.js";
import { exportMemory, importMemory } from "../backup.js";
import { resetWorkspace } from "../runtime/lifecycle.js";
import { choosePrompt, deliverWithFallback } from "../runtime/proactive.js";
import { composeLine } from "../compose.js";
import { effectiveTemplates } from "../templates.js";

export async function handleCompanionRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "GET" && route === "/status") {
    sendJson(res, statusPayload(baseCfg));
    return true;
  }

  if (req.method === "GET" && route === "/heartbeat") {
    const mood = recomputeMood(ws);
    const pulse = readPulse(ws);
    const state = readProactive(ws);
    const rel = readJson(lovePaths(ws).relationship, defaults(ws).relationship);
    let journalDays = 0;
    try {
      journalDays = fs.readdirSync(lovePaths(ws).journal).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).length;
    } catch {}
    let groupCount = 0;
    try {
      groupCount = fs
        .readdirSync(path.join(ws, "memory", "groups"))
        .filter((name) => /^[1-9][0-9]{4,11}$/.test(name)).length;
    } catch {}
    sendJson(res, {
      ok: true,
      mood,
      pulse,
      relationship: rel,
      proactive: {
        enabled: eff.proactiveEnabled === true,
        last_sent: state.last_sent || null,
        next_after: state.next_after || null,
      },
      outbox: outboxStats(ws),
      channel: { id: String(eff.channel || "qq"), describe: createChannel(eff).describe() },
      persona: readPersona(ws),
      memory: {
        journalDays,
        learning: readLearning(ws).items.length,
        stickers: readStickers(ws).items.length,
        groups: groupCount,
      },
      now: localIso(),
    });
    return true;
  }

  if (req.method === "GET" && route === "/probe") {
    const channel = createChannel(eff, { agents: hostState.agentsRef });
    let available = false;
    try {
      available = await channel.available();
    } catch {}
    sendJson(res, {
      ok: true,
      version: pluginVersion(),
      workspace: ws,
      workspaces: soulWorkspaces(eff),
      setupDone: fs.existsSync(lovePaths(ws).profile),
      channel: { id: channel.id, describe: channel.describe(), available },
    });
    return true;
  }

  if (req.method === "GET" && route === "/state") {
    const data = buildAiriState(ws);
    const body = Buffer.from(JSON.stringify(data, null, 2), "utf8");
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return true;
  }

  if (req.method === "GET" && route === "/export") {
    sendJson(res, exportMemory(ws));
    return true;
  }

  if (req.method === "POST" && route === "/import") {
    const body = await readRequestBody(req);
    if (String(body?.confirm || "") !== "IMPORT") {
      throw new Error("导入记忆需要确认：confirm 必须是 IMPORT");
    }
    const resume = await hostState.reflectionWorkerRef?.suspend();
    let result;
    try {
      result = importMemory(ws, body?.bundle);
    } finally {
      resume?.();
    }
    sendJson(res, { ok: true, ...result, ...statusPayload(baseCfg) });
    return true;
  }

  if (req.method === "POST" && route === "/reset") {
    const body = await readRequestBody(req);
    if (String(body?.confirm || "") !== "RESET" || String(body?.workspace || "") !== ws) {
      throw new Error("恢复出厂设置需要确认：confirm=RESET 且 workspace 必须是当前工作区");
    }
    const resume = await hostState.reflectionWorkerRef?.suspend();
    let result;
    try {
      result = resetWorkspace(ws);
    } finally {
      resume?.();
    }
    sendJson(res, { ok: true, ...result, ...statusPayload(baseCfg) });
    return true;
  }

  if (req.method === "POST" && route === "/mood") {
    await readRequestBody(req);
    const mood = recomputeMood(ws);
    sendJson(res, { ok: true, mood, readOnly: true });
    return true;
  }

  if (req.method === "POST" && route === "/dry-run") {
    const state = readProactive(ws);
    const picked = choosePrompt(ws, state, false, baseCfg);
    sendJson(
      res,
      picked ? { ok: true, kind: picked.kind, prompt: picked.prompt } : { ok: false, error: "当前没有合适的话题" },
    );
    return true;
  }

  if (req.method === "POST" && route === "/say") {
    const body = await readRequestBody(req);
    const text = String(body?.text || "").trim();
    const groupId = String(body?.groupId || "").trim();
    if (groupId && !/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    if (groupId && !eff.qqHttpUrl) throw new Error("群聊需要先配置 qqHttpUrl 直发");
    if (groupId) {
      const allowed = Array.isArray(eff.groupIds) ? eff.groupIds.map(String) : [];
      if (allowed.length && !allowed.includes(groupId)) throw new Error("这个群不在允许列表里");
    }
    const line =
      text || composeLine(readPulse(ws), readJson(lovePaths(ws).mood, {}), { templates: effectiveTemplates(ws) });
    if (!line) throw new Error("没有可说的话");
    const intent = {
      id: newIntentId(),
      text: line,
      line,
      kind: "manual",
      key: "manual",
      voice: false,
      emotion: "平静",
      priority: "high",
      createdAt: localIso(),
    };
    if (groupId) intent.groupId = groupId;
    const delivery = await deliverWithFallback(eff, ws, intent, hostState.agentsRef);
    sendJson(res, { ok: true, ...delivery, line });
    return true;
  }
  return false;
}

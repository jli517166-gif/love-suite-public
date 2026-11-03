/** groups HTTP routes. Return true only after handling the request. */
import path from "node:path";
import { sendJson, readRequestBody } from "./transport.js";
import fs from "node:fs";
import { readJson, writeJson } from "../runtime/storage.js";
import { groupWorkspaceFor, readRuntimeConfig, RUNTIME_CONFIG } from "../runtime/config.js";
import { readGroup, groupSummary, addGroupNote } from "../groups.js";
import { reflectionStatus } from "../reflection.js";
import { hostState, groupSessions } from "../runtime/host-state.js";

export async function handleGroupsRoutes(req, res, { url, route, eff, ws, baseCfg, ip }) {
  if (req.method === "GET" && route === "/groups") {
    const root = path.join(ws, "memory", "groups");
    const items = [];
    try {
      for (const id of fs.readdirSync(root)) {
        if (!/^[1-9][0-9]{4,11}$/.test(id)) continue;
        const data = readJson(path.join(root, id, "group.json"), { members: {}, notes: [] });
        items.push({
          id,
          members: Object.keys(data.members || {}).length,
          notes: Array.isArray(data.notes) ? data.notes.length : 0,
          last_active: data.last_active || null,
        });
      }
    } catch {}
    sendJson(res, { ok: true, items });
    return true;
  }

  if (req.method === "GET" && route === "/group/status") {
    const groupId = String(url.searchParams.get("groupId") || "").trim();
    const groupWs = groupWorkspaceFor(ws, groupId);
    const group = readGroup(groupWs, groupId);
    const members = Object.entries(group.members || {})
      .map(([qq, member]) => ({
        qq,
        nickname: member.nickname || qq,
        messages: Number(member.messages) || 0,
        affection: Number(member.affection ?? 5),
        trust: Number(member.trust ?? 5),
        last_seen: member.last_seen || null,
      }))
      .sort((a, b) => b.affection - a.affection || b.messages - a.messages);
    sendJson(res, {
      ok: true,
      groupId,
      summary: groupSummary(groupWs, groupId),
      workspace: groupWs,
      members,
      notes: Array.isArray(group.notes) ? group.notes.slice(-20).reverse() : [],
      reflection: (() => {
        try {
          return reflectionStatus(groupWs, groupId);
        } catch {
          return { error: "整理队列读取失败，未自动重置" };
        }
      })(),
      config: {
        groupProactive: eff.groupProactive === true,
        groupMemoryEnabled: eff.groupMemoryEnabled !== false,
        groupContextMessages: Number(eff.groupContextMessages ?? 20),
      },
    });
    return true;
  }

  if (req.method === "POST" && route === "/group/workspace") {
    const body = await readRequestBody(req);
    const groupId = String(body?.groupId || "").trim();
    if (!/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    const workspace = String(body?.workspace || "").trim();
    if (!workspace || /^[\\/]{2}/.test(workspace)) throw new Error("群工作区必须是本地路径");
    if (!fs.existsSync(workspace) || !fs.existsSync(path.join(workspace, "memory")))
      throw new Error("群工作区必须是已存在的 love 工作区（含 memory/）");
    const oldWorkspace = groupWorkspaceFor(ws, groupId);
    const oldDir = path.join(oldWorkspace, "memory", "groups", groupId);
    const newDir = path.join(workspace, "memory", "groups", groupId);
    const hasOld = fs.existsSync(oldDir);
    if (hasOld && workspace !== oldWorkspace && body?.migrate !== true) {
      let members = 0,
        notes = 0;
      try {
        const old = readGroup(oldWorkspace, groupId);
        members = Object.keys(old.members || {}).length;
        notes = (old.notes || []).length;
      } catch {}
      sendJson(
        res,
        {
          ok: false,
          code: "group-workspace-move",
          error: "旧群工作区还有 " + members + " 个群友、" + notes + " 条共享记忆，确认迁移？",
          oldWorkspace,
          members,
          notes,
        },
        409,
      );
      return true;
    }
    const resume = await hostState.reflectionWorkerRef?.suspend();
    try {
      if (hasOld && body?.migrate === true && path.resolve(oldDir) !== path.resolve(newDir)) {
        fs.mkdirSync(path.dirname(newDir), { recursive: true });
        fs.cpSync(oldDir, newDir, { recursive: true, force: true });
      }
      const next = { ...readRuntimeConfig() };
      next.groupWorkspaces = { ...(next.groupWorkspaces || {}), [groupId]: workspace };
      writeJson(RUNTIME_CONFIG, next);
      for (const scope of groupSessions.values()) if (scope.groupId === groupId) scope.workspace = workspace;
    } finally {
      resume?.();
    }
    sendJson(res, { ok: true, workspace, migrated: hasOld && body?.migrate === true });
    return true;
  }

  if (req.method === "POST" && route === "/group/clear") {
    const body = await readRequestBody(req);
    const groupId = String(body?.groupId || "").trim();
    if (!/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    if (String(body?.confirm || "") !== groupId) throw new Error("请输入群号确认清除");
    const groupWs = groupWorkspaceFor(ws, groupId);
    const dir = path.join(groupWs, "memory", "groups", groupId);
    const resume = await hostState.reflectionWorkerRef?.suspend();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } finally {
      resume?.();
    }
    sendJson(res, { ok: true });
    return true;
  }

  if (req.method === "POST" && route === "/group/workspace/clear") {
    const body = await readRequestBody(req);
    const groupId = String(body?.groupId || "").trim();
    if (!/^[1-9][0-9]{4,11}$/.test(groupId)) throw new Error("群号不合法");
    const resume = await hostState.reflectionWorkerRef?.suspend();
    try {
      const next = { ...readRuntimeConfig() };
      if (next.groupWorkspaces) delete next.groupWorkspaces[groupId];
      writeJson(RUNTIME_CONFIG, next);
      for (const scope of groupSessions.values()) if (scope.groupId === groupId) scope.workspace = ws;
    } finally {
      resume?.();
    }
    sendJson(res, { ok: true });
    return true;
  }

  if (req.method === "POST" && route === "/group/note") {
    const body = await readRequestBody(req);
    const groupId = String(body?.groupId || "").trim();
    const text = String(body?.text || "").trim();
    if (!text) throw new Error("群记忆不能为空");
    addGroupNote(groupWorkspaceFor(ws, groupId), groupId, text);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
}

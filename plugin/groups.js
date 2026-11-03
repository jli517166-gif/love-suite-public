/**
 * 群聊记忆：群里共享的事 + 每个群友的关系底稿。
 *
 * 目录：memory/groups/<群号>/
 *   group.json          群共享：notes、last_active、member 列表
 *   members/<QQ>.json   某个群友：昵称、消息数、上次说话、备注
 *
 * 只做记录，不主动发言；清理在后续版本按重要性和时间做。
 */

import fs from "node:fs";
import path from "node:path";
import { appraise } from "./appraisal.js";

const MAX_MEMBERS = 500;
const MAX_NOTES = 200;

export function groupPaths(workspace, groupId) {
  const id = String(groupId || "").trim();
  if (!/^[1-9][0-9]{4,11}$/.test(id)) throw new Error("群号不合法");
  const dir = path.join(workspace, "memory", "groups", id);
  return {
    id,
    dir,
    group: path.join(dir, "group.json"),
    members: path.join(dir, "members"),
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function readGroupMember(workspace, groupId, qq) {
  const p = groupPaths(workspace, groupId);
  const id = String(qq || "").trim();
  if (!/^[1-9][0-9]{4,11}$/.test(id)) return null;
  const data = readJson(path.join(p.members, id + ".json"), null);
  return data && typeof data === "object" ? data : null;
}

export function groupMessagesFile(workspace, groupId) {
  const p = groupPaths(workspace, groupId);
  return path.join(p.dir, "messages.jsonl");
}

/** 去掉 onebot 包裹和元信息，只留人话。 */
export function cleanGroupText(text) {
  return String(text || "")
    .replace(/<user_message[^>]*>/g, "")
    .replace(/<\/user_message>/g, "")
    .replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, "")
    .replace(/\[@我\]/g, "")
    .replace(/@\d{5,12}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** 追加一条群消息，保留最近 500 条。 */
export function appendGroupMessage(workspace, groupId, qq, nickname, text, at = new Date().toISOString()) {
  const p = groupPaths(workspace, groupId);
  const line = JSON.stringify({
    at,
    qq: String(qq || ""),
    nickname: String(nickname || "").slice(0, 40),
    text: cleanGroupText(text),
  });
  fs.mkdirSync(p.dir, { recursive: true });
  const file = groupMessagesFile(workspace, groupId);
  // 直接追加，避免每条群消息都重写 500 行；文件超过 200KB 再裁剪一次。
  fs.appendFileSync(file, line + "\n", "utf8");
  try {
    if (fs.statSync(file).size > 200_000) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-500);
      fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
    }
  } catch {}
}

export function readGroupMessages(workspace, groupId, limit = 20) {
  limit = Math.min(500, Math.max(0, Number(limit) || 0));
  const file = groupMessagesFile(workspace, groupId);
  let lines = [];
  try { lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean); } catch { return []; }
  const out = [];
  for (const line of lines.slice(-Math.max(0, limit))) {
    try {
      const item = JSON.parse(line);
      if (item && item.text) out.push(item);
    } catch {}
  }
  return out;
}

export function readGroup(workspace, groupId) {
  const p = groupPaths(workspace, groupId);
  const data = readJson(p.group, null);
  return data && typeof data === "object"
    ? { notes: [], members: {}, ...data }
    : { id: p.id, created_at: new Date().toISOString(), last_active: null, notes: [], members: {} };
}

/** 记一条群友消息；只保留最近 120 字，成员数有上限。 */
export function recordGroupMessage(workspace, groupId, qq, nickname, text) {
  const p = groupPaths(workspace, groupId);
  const memberId = String(qq || "").trim();
  if (!/^[1-9][0-9]{4,11}$/.test(memberId)) throw new Error("QQ 号不合法");
  const group = readGroup(workspace, groupId);
  const now = new Date().toISOString();
  const previous = group.members[memberId] || { messages: 0 };
  const delta = appraise(text).delta;
  const today = now.slice(0, 10);
  const dailyDelta = previous.daily_date === today ? Number(previous.daily_delta) || 0 : 0;
  let applied = delta;
  if (Math.abs(dailyDelta + delta) > 2) applied = Math.sign(delta) * Math.max(0, 2 - Math.abs(dailyDelta));
  const affection = Math.max(0, Math.min(100, Number(previous.affection ?? 5) + applied));
  group.members[memberId] = {
    ...previous,
    nickname: String(nickname || previous.nickname || "").slice(0, 40),
    messages: Number(previous.messages || 0) + 1,
    affection,
    trust: Math.max(0, Math.min(100, Number(previous.trust ?? 5))),
    last_seen: now,
    last_text: String(text || "").slice(0, 120),
    daily_date: today,
    daily_delta: dailyDelta + applied,
  };
  group.last_active = now;
  if (!group.created_at) group.created_at = now;

  const entries = Object.entries(group.members).sort((a, b) => String(a[1].last_seen).localeCompare(String(b[1].last_seen)));
  while (entries.length > MAX_MEMBERS) {
    const [drop] = entries.shift();
    delete group.members[drop];
  }
  writeJson(p.group, group);

  const memberFile = path.join(p.members, memberId + ".json");
  writeJson(memberFile, {
    id: memberId,
    nickname: group.members[memberId].nickname,
    messages: group.members[memberId].messages,
    affection: group.members[memberId].affection,
    trust: group.members[memberId].trust,
    daily_date: group.members[memberId].daily_date,
    daily_delta: group.members[memberId].daily_delta,
    first_seen: previous.first_seen || now,
    last_seen: now,
    notes: Array.isArray(previous.notes) ? previous.notes : [],
  });
  if (Object.keys(group.members).length > 400) pruneGroup(workspace, groupId);
  return group;
}

/** 往群共享记忆里加一条（她决定记什么时调用）。 */
export function addGroupNote(workspace, groupId, text) {
  const p = groupPaths(workspace, groupId);
  const group = readGroup(workspace, groupId);
  const note = String(text || "").trim();
  if (!note) throw new Error("群记忆不能为空");
  const recent = (Array.isArray(group.notes) ? group.notes : []).slice(-20);
  if (recent.some((item) => item.text === note.slice(0, 300))) return group;
  group.notes = (Array.isArray(group.notes) ? group.notes : []).concat({
    text: note.slice(0, 300),
    at: new Date().toISOString(),
  }).slice(-MAX_NOTES);
  writeJson(p.group, group);
  return group;
}

/** 清理长期不活跃、且只说过一两次话的群友；共享笔记不动。 */
export function pruneGroup(workspace, groupId, { now = Date.now(), maxAgeDays = 365, minMessages = 3 } = {}) {
  const p = groupPaths(workspace, groupId);
  const group = readGroup(workspace, groupId);
  const cutoff = now - Math.max(1, maxAgeDays) * 86400000;
  const removed = [];
  for (const [qq, member] of Object.entries(group.members || {})) {
    const seen = Date.parse(member.last_seen || "");
    if (Number.isFinite(seen) && seen < cutoff && Number(member.messages || 0) < minMessages) {
      delete group.members[qq];
      removed.push(qq);
    }
  }
  if (removed.length) {
    writeJson(p.group, group);
    for (const qq of removed) {
      try { fs.rmSync(path.join(p.members, qq + ".json"), { force: true }); } catch {}
    }
  }
  return { removed: removed.length };
}

export function groupSummary(workspace, groupId) {
  const group = readGroup(workspace, groupId);
  return {
    id: groupId,
    members: Object.keys(group.members || {}).length,
    notes: Array.isArray(group.notes) ? group.notes.length : 0,
    last_active: group.last_active || null,
  };
}

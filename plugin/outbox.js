/**
 * 发件箱：灵魂想说话、但介质暂时不在线时的缓冲区。
 *
 * 这是「离开 QQ 也有灵魂」的关键一件：主动意图先生成、先生效，投递失败就落到
 * `memory/outbox.jsonl`，等通道回来再补发；过期（默认 6 小时）就静默丢掉——
 * 昨天想说的话今天才冒出来，比不说更糟。
 */

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_TTL_MINUTES = 360;

export function outboxPath(workspace) {
  return path.join(workspace, "memory", "outbox.jsonl");
}

function readLines(workspace) {
  const file = outboxPath(workspace);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && entry.id && entry.text) out.push(entry);
    } catch {
      // 坏行跳过，不让一条脏数据卡住整个发件箱
    }
  }
  return out;
}

function writeLines(workspace, entries) {
  const file = outboxPath(workspace);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(file, body ? body + "\n" : "", "utf8");
}

let counter = 0;

/** 生成一个可读、可排序的 id：基于时间戳 + 进程内序号。 */
export function newIntentId(now = Date.now()) {
  counter = (counter + 1) % 10000;
  return `i${now.toString(36)}-${counter.toString(36)}`;
}

/**
 * 把一条意图放进发件箱（去重：同样文本 10 分钟内只留一条）。
 * @returns {object} 实际写入的条目
 */
export function enqueue(workspace, intent, now = Date.now()) {
  const entries = readLines(workspace);
  const text = String(intent?.text ?? "").trim();
  const duplicate = entries.find((entry) =>
    entry.text === text && now - Date.parse(entry.createdAt) < 10 * 60000);
  if (duplicate) return duplicate;

  const entry = {
    id: intent?.id || newIntentId(now),
    createdAt: intent?.createdAt || new Date(now).toISOString(),
    text,
    line: String(intent?.line ?? ""),
    kind: intent?.kind || "proactive",
    emotion: intent?.emotion || "平静",
    voice: Boolean(intent?.voice),
    priority: intent?.priority || "low",
  };
  entries.push(entry);
  writeLines(workspace, entries.slice(-50));
  return entry;
}

/** 发件箱统计（给 status 用）。 */
export function outboxStats(workspace, now = Date.now(), ttlMinutes = DEFAULT_TTL_MINUTES) {
  const entries = readLines(workspace);
  const fresh = entries.filter((entry) => now - Date.parse(entry.createdAt) < ttlMinutes * 60000);
  return {
    total: entries.length,
    fresh: fresh.length,
    oldest: entries.length ? entries[0].createdAt : null,
  };
}

/**
 * 取一条可补发的意图：只取最新的一条未过期条目，并顺手清掉过期条目。
 * 返回的条目**还留在文件里**，投递成功后调用 {@link removeIntent}。
 * @returns {object | undefined}
 */
export function pickDeliverable(workspace, now = Date.now(), ttlMinutes = DEFAULT_TTL_MINUTES) {
  const entries = readLines(workspace);
  const fresh = entries.filter((entry) => now - Date.parse(entry.createdAt) < ttlMinutes * 60000);
  if (fresh.length !== entries.length) writeLines(workspace, fresh);
  return fresh[fresh.length - 1];
}

/** 投递成功后从发件箱删掉一条。 */
export function removeIntent(workspace, id) {
  const entries = readLines(workspace);
  const kept = entries.filter((entry) => entry.id !== id);
  if (kept.length !== entries.length) writeLines(workspace, kept);
  return entries.length - kept.length;
}

/** 清空发件箱（重置/测试用）。 */
export function clearOutbox(workspace) {
  writeLines(workspace, []);
}

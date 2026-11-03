/**
 * meow-memory 统一：只读检索它的 SQLite 记忆库，把长期记忆合进 love_recall。
 *
 * 不写它的库、不依赖它的内部 API；库不存在或 node:sqlite 不可用时静默跳过。
 */

import fs from "node:fs";
import path from "node:path";
import { rankByQuery } from "./retrieval.js";

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {}

const TABLES = ["soul", "user", "project", "fact", "lesson", "topic", "rules"];

export function meowAvailable() {
  return Boolean(DatabaseSync);
}

export function meowDbFile(workspace) {
  return path.join(String(workspace || ""), ".dsh-meow", "memory.db");
}

/**
 * @param {string} workspace
 * @param {string} query
 * @param {number} limit
 * @returns {{content: string, importance: number, table: string}[]}
 */
export function searchMeow(workspace, query, limit = 4) {
  if (!DatabaseSync) return [];
  const file = meowDbFile(workspace);
  if (!fs.existsSync(file)) return [];

  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = [];
    for (const table of TABLES) {
      try {
        const items = db.prepare(
          `SELECT content, keywords, importance, status FROM ${table} WHERE content IS NOT NULL`,
        ).all();
        for (const item of items) {
          if (!item.content || item.status === "archived") continue;
          rows.push({ ...item, table });
        }
      } catch {
        // 旧版 meow 可能没有某张表，跳过
      }
    }
    if (!rows.length) return [];
    return rankByQuery(rows, query, (row) => `${row.content} ${row.keywords || ""}`, limit)
      .map((row) => ({ content: String(row.content), importance: Number(row.importance) || 0, table: row.table }));
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

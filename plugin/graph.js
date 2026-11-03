/**
 * 记忆星图的数据层：把 love 的记忆读成一张 3D 星图（节点 + 连线）。
 *
 * 来源：
 *   - memory/net.json           实体 / 关系 / 事件
 *   - .dsh-meow/memory.db       七层长期记忆（只读，node:sqlite）
 *   - memory/journal/*.md       陪伴日记（新增图层）
 *   - memory/life.jsonl         她的小生活（新增图层）
 *   - memory/self.md            自我叙事（新增图层，手写部分）
 *
 * 只读。任何一块缺失/损坏都只是少几个节点，不会让星图整体失败。
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { coreMemoryGraph } from './core-memory.js';
import { mergeLegacyGraph } from './legacy-memory.js';

const TABLES = ["project", "lesson", "user", "rules", "fact", "topic", "soul"];
const MAX_NODES = 900;
const MAX_LINKS = 3000;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function parseKeywords(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String);
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const value = JSON.parse(text);
    if (Array.isArray(value)) return value.map(String);
  } catch {}
  return text.replace(/，/g, ",").split(",").map((s) => s.trim()).filter(Boolean);
}

function localIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

function readJournal(workspace, all = false) {
  const dir = path.join(workspace, "memory", "journal");
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort();
    if (all && fs.existsSync(path.join(dir, 'archive'))) names.push(...fs.readdirSync(path.join(dir, 'archive')).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort().map((name) => path.join('archive', name)));
    if (!all) names = names.slice(-30);
  } catch {
    return out;
  }
  for (const name of names) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, name), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*-\s+(.*)$/);
      if (match) out.push({ date: path.basename(name).slice(0, 10), text: match[1].trim() });
    }
  }
  return out;
}

function readLife(workspace, all = false) {
  const out = [];
  let text = "";
  try {
    text = fs.readFileSync(path.join(workspace, "memory", "life.jsonl"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.text) out.push(entry);
    } catch {}
  }
  return all ? out : out.slice(-80);
}

function selfNarrative(workspace) {
  let text = "";
  try {
    text = fs.readFileSync(path.join(workspace, "memory", "self.md"), "utf8");
  } catch {
    return "";
  }
  const idx = text.indexOf("<!-- auto -->");
  const head = idx > 0 ? text.slice(0, idx) : text;
  return head
    .replace(/^#.*$/m, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.includes("（这段由我自己写"))
    .join("\n")
    .trim();
}

/** 只读打开 meow 的 SQLite；读不到就返回空数组（不影响其它层）。 */
async function readMeowMemories(workspace) {
  const dbFile = path.join(workspace, ".dsh-meow", "memory.db");
  if (!fs.existsSync(dbFile)) return [];
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return [];
  }
  let db;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });
  } catch {
    return [];
  }
  const out = [];
  try {
    for (const table of TABLES) {
      let columns = [];
      try {
        columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
      } catch {
        continue;
      }
      if (!columns.length) continue;
      const wanted = ["id", "title", "content", "importance", "keywords", "status", "project", "subcategory", "corrected"]
        .filter((name) => columns.includes(name));
      if (!wanted.includes("content")) continue;
      let rows = [];
      try {
        rows = db.prepare(`SELECT ${wanted.join(",")} FROM ${table}`).all();
      } catch {
        continue;
      }
      for (const row of rows) {
        const status = row.status || "active";
        if (status === "archived") continue;
        if (row.id == null) row.id = createHash('sha256').update(JSON.stringify([table, row.content])).digest('hex');
        out.push({ ...row, _table: table, _status: status });
      }
    }
  } finally {
    try {
      db.close();
    } catch {}
  }
  return out;
}

/** 数据源版本：文件 mtime/size 的哈希，给页面判断要不要刷新。 */
export function graphStatus(workspace) {
  const files = [
    path.join(workspace, "memory", "net.json"),
    path.join(workspace, ".dsh-meow", "memory.db"),
    path.join(workspace, ".dsh-meow", "memory.db-wal"),
    path.join(workspace, "memory", "self.md"),
    path.join(workspace, "memory", "life.jsonl"),
    path.join(workspace, "memory", "core-memory.json"),
  ];
  const parts = [];
  let newest = 0;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      newest = Math.max(newest, stat.mtimeMs);
      parts.push(`${path.basename(file)}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      parts.push(`${path.basename(file)}:missing`);
    }
  }
  try {
    const groupsDir = path.join(workspace, 'memory', 'groups');
    for (const group of fs.readdirSync(groupsDir).sort()) {
      if (!/^[1-9][0-9]{4,11}$/.test(group)) continue;
      const file = path.join(groupsDir, group, 'core-memory.json');
      if (fs.existsSync(file)) { const stat = fs.statSync(file); parts.push(`core:${group}:${stat.mtimeMs}:${stat.size}`); newest = Math.max(newest, stat.mtimeMs); }
    }
  } catch {}
  try {
    const journalDir = path.join(workspace, "memory", "journal");
    const names = fs.readdirSync(journalDir).sort();
    const last = names[names.length - 1] || "";
    if (last) {
      const stat = fs.statSync(path.join(journalDir, last));
      newest = Math.max(newest, stat.mtimeMs);
      parts.push(`${last}:${stat.mtimeMs}`);
    }
  } catch {}
  return {
    version: createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16),
    newest,
  };
}

/**
 * 生成星图数据。
 * @param {string} workspace love 工作区
 */

/** 群记忆星图：群、群友、群共享笔记；只读。 */
export async function buildGroupGraph(workspace, groupId, { legacyOnly = false } = {}) {
  const id = String(groupId || "").trim();
  if (!/^[1-9][0-9]{4,11}$/.test(id)) throw new Error("群号不合法");
  const dir = path.join(workspace, "memory", "groups", id);
  const group = readJson(path.join(dir, "group.json"), { members: {}, notes: [] });
  let nodes = [];
  let links = [];
  const addNode = (node) => { if (node?.id && !nodes.some((n) => n.id === node.id)) nodes.push(node); };
  addNode({
    id: "group:" + id,
    label: "群 " + id,
    type: "group",
    layer: "group",
    importance: 5,
    degree: 0,
    text: "群聊记忆：只放这个群共享的事。",
  });
  for (const [qq, member] of Object.entries(group.members || {})) {
    addNode({
      id: "member:" + qq,
      label: member.nickname || qq,
      type: "entity",
      layer: "member",
      importance: 3,
      degree: 1,
      text: `群友 ${member.nickname || qq}（${qq}）｜消息 ${member.messages || 0}｜好感 ${member.affection ?? 5}｜上次 ${String(member.last_seen || "").slice(0, 16)}`,
    });
    links.push({ source: "member:" + qq, target: "group:" + id, relation: "群友" });
  }
  for (const [index, note] of (Array.isArray(group.notes) ? group.notes : []).entries()) {
    const hash = createHash("sha1").update(String(note.text || "") + index).digest("hex").slice(0, 12);
    addNode({
      id: "group-note:" + hash,
      label: String(note.text || "").slice(0, 24),
      type: "memory",
      layer: "groupNote",
      importance: 2,
      degree: 1,
      text: String(note.text || ""),
    });
    links.push({ source: "group-note:" + hash, target: "group:" + id, relation: "群记忆" });
  }
  const authored = legacyOnly ? { cores: [], nodes: [], links: [], revision: 0 } : coreMemoryGraph(workspace, id);
  ({ nodes, links } = mergeLegacyGraph(nodes, links, authored));
  return {
    ok: true,
    groupId: id,
    cores: authored.revision ? authored.cores : [],
    coreRevision: authored.revision,
    nodes,
    links,
    stats: { nodes: nodes.length, links: links.length, members: Object.keys(group.members || {}).length, notes: Array.isArray(group.notes) ? group.notes.length : 0 },
  };
}


/** 全部记忆：私聊 + 所有群，节点 id 加前缀避免撞车。 */
export async function buildAllGraph(workspace) {
  const base = await buildGraph(workspace);
  const nodes = base.nodes.map((node) => ({ ...node }));
  const links = base.links.map((link) => ({ ...link }));
  const cores = [...(base.cores || [])];
  let members = 0;
  let notes = 0;
  let groupCount = 0;
  const groupsRoot = path.join(workspace, "memory", "groups");
  let ids = [];
  try { ids = fs.readdirSync(groupsRoot).filter((id) => /^[1-9][0-9]{4,11}$/.test(id)); } catch {}
  for (const id of ids) {
    try {
      const group = await buildGroupGraph(workspace, id);
      const prefix = "g" + id + ":";
      for (const node of group.nodes) nodes.push({ ...node, id: prefix + node.id, ...(node.coreId ? { coreId: prefix + node.coreId } : {}) });
      for (const core of group.cores || []) cores.push({ ...core, id: prefix + core.id, title: `群 ${id} · ${core.title}`, parentId: core.parentId ? prefix + core.parentId : 'self' });
      for (const link of group.links) links.push({ ...link, source: prefix + link.source, target: prefix + link.target });
      members += group.stats.members;
      notes += group.stats.notes;
      groupCount += 1;
    } catch {}
  }
  return {
    ok: true,
    scope: "all",
    cores,
    nodes,
    links,
    stats: {
      nodes: nodes.length,
      links: links.length,
      memories: (base.stats?.memories || 0) + notes,
      groups: groupCount,
      members,
      notes,
    },
  };
}

export async function buildGraph(workspace, { legacyOnly = false } = {}) {
  const net = readJson(path.join(workspace, "memory", "net.json"), { nodes: {}, edges: [], episodes: [] });
  let nodes = [];
  let links = [];
  const seen = new Set();

  const addNode = (node) => {
    if (!node?.id || seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };

  // 1) 记忆网实体
  for (const [name, entity] of Object.entries(net.nodes || {})) {
    const mentions = Number(entity?.mentions || 0);
    addNode({
      id: "ent:" + name,
      label: name,
      layer: "entity",
      type: entity?.type || "thing",
      content: entity?.note || "",
      importance: entity?.type === "person" ? 3 : 2,
      size: 6 + Math.min(10, mentions * 1.2) + (entity?.type === "person" ? 2 : 0),
    });
  }

  // 2) 实体关系
  for (const edge of net.edges || []) {
    if (!edge?.from || !edge?.to) continue;
    if (!seen.has("ent:" + edge.from) || !seen.has("ent:" + edge.to)) continue;
    links.push({ source: "ent:" + edge.from, target: "ent:" + edge.to, kind: "relation", label: edge.relation || "" });
  }

  // 3) 事件
  for (const [index, episode] of (net.episodes || []).entries()) {
    const id = `ep:${index}`;
    addNode({
      id,
      label: String(episode?.text || "").slice(0, 34),
      layer: "episode",
      content: `${episode?.date || ""} ${episode?.text || ""}`.trim(),
      importance: 2,
      size: 5,
    });
    for (const name of episode?.entities || []) {
      if (seen.has("ent:" + name)) links.push({ source: id, target: "ent:" + name, kind: "event" });
    }
  }

  // 4) meow 七层记忆
  const memories = await readMeowMemories(workspace);
  const entityNames = nodes.filter((node) => node.layer === "entity").map((node) => node.label);
  const linkToEntities = (id, content, keywords, cap = 4) => {
    let hit = 0;
    for (const name of entityNames) {
      if (name && (content.includes(name) || keywords.includes(name))) {
        links.push({ source: id, target: "ent:" + name, kind: "mentions" });
        if (++hit >= cap) break;
      }
    }
  };

  for (const memory of memories) {
    const id = `mem:${memory._table}:${String(memory.id)}`;
    const content = String(memory.content || "");
    const keywords = parseKeywords(memory.keywords);
    const importance = Number(memory.importance || 1);
    const label = String(memory.title || "").trim() || content.slice(0, 34);
    addNode({
      id,
      label,
      aliases: [`mem:${memory._table}:${String(memory.id).slice(0, 10)}`],
      layer: TABLES.includes(memory._table) ? memory._table : "fact",
      content,
      project: memory.project || "",
      subcategory: memory.subcategory || "",
      status: memory._status || "active",
      corrected: Boolean(Number(memory.corrected || 0)),
      importance,
      keywords,
      size: 5 + Math.min(12, importance * 2.2),
    });
    linkToEntities(id, content, keywords);
  }

  // 5) 记忆之间共享关键词
  const keywordIndex = new Map();
  for (const memory of memories) {
    const id = `mem:${memory._table}:${String(memory.id)}`;
    for (const keyword of parseKeywords(memory.keywords).slice(0, 12)) {
      const list = keywordIndex.get(keyword) || [];
      list.push(id);
      keywordIndex.set(keyword, list);
    }
  }
  const pairSeen = new Set();
  const perNode = new Map();
  for (const [keyword, ids] of keywordIndex) {
    if (ids.length < 2) continue;
    for (let i = 0; i < Math.min(ids.length, 12); i++) {
      for (let j = i + 1; j < Math.min(ids.length, 12); j++) {
        const a = ids[i];
        const b = ids[j];
        if (a === b) continue;
        const key = [a, b].sort().join("\u0000");
        if (pairSeen.has(key)) continue;
        if ((perNode.get(a) || 0) >= 3 || (perNode.get(b) || 0) >= 3) continue;
        pairSeen.add(key);
        perNode.set(a, (perNode.get(a) || 0) + 1);
        perNode.set(b, (perNode.get(b) || 0) + 1);
        links.push({ source: a, target: b, kind: "related", label: keyword });
      }
    }
  }

  // 6) 陪伴日记（新图层）
  const journal = readJournal(workspace, legacyOnly);
  for (const [index, entry] of (legacyOnly ? journal : journal.slice(-120)).entries()) {
    const id = `jr:${entry.date}:${index}`;
    addNode({
      id,
      label: entry.text.slice(0, 34),
      layer: "journal",
      content: `${entry.date} ${entry.text}`,
      importance: 2,
      size: 5,
    });
    linkToEntities(id, entry.text, []);
  }

  // 7) 小生活（新图层）
  const life = readLife(workspace, legacyOnly);
  for (const [index, entry] of life.entries()) {
    const id = `lf:${index}:${String(entry.date || "").slice(0, 16)}`;
    addNode({
      id,
      label: String(entry.text || "").slice(0, 34),
      layer: "life",
      content: `${entry.date || ""} ${entry.text || ""}`,
      importance: 1,
      size: 4,
    });
    linkToEntities(id, String(entry.text || ""), []);
  }

  // 8) 自我叙事（新图层）
  const self = selfNarrative(workspace);
  if (self) {
    const id = "self:me";
    addNode({
      id,
      label: "自我",
      layer: "soul",
      content: self,
      importance: 4,
      size: 14,
    });
  }

  // 按层配额保留，避免某层把后面的层整段截掉；每层优先留最近的条目。
  const authored = legacyOnly ? { cores: [], nodes: [], links: [], revision: 0 } : coreMemoryGraph(workspace);
  ({ nodes, links } = mergeLegacyGraph(nodes, links, authored));
  if (legacyOnly) return { nodes, links, cores: [], coreRevision: 0, stats: { totalNodes: nodes.length, truncated: 0 } };
  const byLayer = new Map();
  for (const node of nodes) {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
    byLayer.get(node.layer).push(node);
  }
  const layerCount = Math.max(1, byLayer.size);
  const quota = Math.max(8, Math.floor(MAX_NODES / layerCount));
  const picked = [];
  const overflow = [];
  for (const list of byLayer.values()) {
    if (list.length <= quota) {
      picked.push(...list);
    } else {
      picked.push(...list.slice(-quota));
      overflow.push(...list.slice(0, -quota));
    }
  }
  overflow.sort((a, b) => nodes.indexOf(b) - nodes.indexOf(a));
  while (picked.length < MAX_NODES && overflow.length) picked.push(overflow.shift());
  const cappedNodes = picked.slice(0, MAX_NODES);
  const ids = new Set([...cappedNodes, ...authored.cores].map((node) => node.id));
  const cappedLinks = links.filter((link) => ids.has(link.source) && ids.has(link.target)).slice(0, MAX_LINKS);

  return {
    generated_at: localIso(),
    cores: authored.revision ? authored.cores : [],
    coreRevision: authored.revision,
    nodes: cappedNodes,
    links: cappedLinks,
    stats: {
      nodes: cappedNodes.length,
      links: cappedLinks.length,
      memories: memories.length,
      entities: cappedNodes.filter((node) => node.layer === "entity").length,
      journal: cappedNodes.filter((node) => node.layer === "journal").length,
      life: cappedNodes.filter((node) => node.layer === "life").length,
      totalNodes: nodes.length,
      shownNodes: cappedNodes.length,
      truncated: Math.max(0, nodes.length - cappedNodes.length),
    },
  };
}

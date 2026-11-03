/** Scoped, read-only retrieval. Semantic ranking never grants access to new records. */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildGraph, buildGroupGraph } from './graph.js';
import { readCoreMemory, currentMemorySources } from './core-memory.js';
import { auxiliaryLegacyNodes, legacyCandidates } from './legacy-memory.js';
import { rankByQuery, recallTokens } from './retrieval.js';

const SEMANTIC_LIMIT = 256, SEMANTIC_TEXT = 4000;
let semanticModule, semanticFlight = null;
const json = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const normalized = value => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
async function defaultSemantic() {
  semanticModule ??= import('dsh-love-semantic').catch(() => null);
  const module = await semanticModule;
  return typeof module?.rankBySemantic === 'function' ? (query, items, options) => module.rankBySemantic(query, items, item => item.text, options) : null;
}

export async function searchMemories(workspace, query, { groupId = '', limit = 12, semanticEnabled = true, semanticRank, semanticTimeoutMs = 1200 } = {}) {
  const started = performance.now(), keyword = String(query || '').trim();
  limit = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.trunc(limit))) : 12;
  const store = readCoreMemory(workspace, groupId);
  const graph = groupId ? await buildGroupGraph(workspace, groupId, { legacyOnly: true }) : await buildGraph(workspace, { legacyOnly: true });
  if (!groupId) {
    const profile = json(path.join(workspace, 'memory/profile.json'), {}), learning = json(path.join(workspace, 'memory/learning.json'), {});
    graph.nodes.push(...auxiliaryLegacyNodes(profile, Array.isArray(learning.items) ? learning.items : []));
  }
  const activeCores = new Map(store.cores.filter(core => core.status === 'active').map(core => [core.id, core]));
  const { candidates: legacy } = legacyCandidates(graph, store, { maxContentLength: Infinity });
  const raw = [
    ...store.memories.filter(memory => memory.status === 'active' && activeCores.has(memory.coreId)).map(memory => ({
      id: memory.id, content: memory.content, origin: 'core', layer: 'core', coreId: memory.coreId, title: activeCores.get(memory.coreId).title,
      epistemic: memory.epistemic, sourceRefs: currentMemorySources(memory).map(source => source.reference),
      aliases: memory.legacy?.nodeIds || [], keywords: memory.legacy?.keywords || [],
    })),
    ...legacy.map(item => ({ id: item.legacyId, content: item.content, origin: 'legacy', layer: item.layer, title: item.label, epistemic: 'legacy-unverified', sourceRefs: [item.legacyId], aliases: item.nodeIds, keywords: item.keywords })),
  ];
  const candidates = [], byText = new Map(), aliases = new Map();
  for (const item of raw) {
    const key = normalized(item.content), existing = byText.get(key);
    if (existing) {
      existing.sourceRefs = [...new Set([...existing.sourceRefs, ...item.sourceRefs])];
      existing.keywords = [...new Set([...existing.keywords, ...item.keywords])];
      existing.searchTitles = [...new Set([...existing.searchTitles, item.title])];
      existing.text = [existing.content, ...existing.searchTitles, ...existing.keywords].join('\n');
      for (const id of [item.id, ...item.aliases]) aliases.set(id, existing.id);
      continue;
    }
    const entry = { ...item, searchTitles: [item.title], text: [item.content, item.title, ...item.keywords].join('\n') };
    candidates.push(entry); byText.set(key, entry);
    for (const id of [item.id, ...item.aliases]) aliases.set(id, item.id);
  }
  const searchable = recallTokens(keyword).length > 0;
  const lexical = searchable ? rankByQuery(candidates, keyword, item => item.text, 96) : [];
  const ranked = new Map();
  const add = (item, rank, method) => {
    if (!ranked.has(item.id)) ranked.set(item.id, { item, score: 0, matchBy: [] });
    const row = ranked.get(item.id); row.score += 1 / (60 + rank);
    if (!row.matchBy.includes(method)) row.matchBy.push(method);
  };
  lexical.forEach((item, index) => add(item, index + 1, 'keyword'));
  let semanticStatus = semanticEnabled ? 'unavailable' : 'disabled', semanticCandidates = 0, semanticTextTruncated = 0;
  if (searchable && limit && semanticEnabled && candidates.length) {
    const ranker = semanticRank || await defaultSemantic();
    if (ranker) {
      if (semanticFlight) semanticStatus = 'busy';
      else {
        const pool = [...new Map([...lexical, ...candidates.slice(-(SEMANTIC_LIMIT - lexical.length))].map(item => [item.id, item])).values()].slice(0, SEMANTIC_LIMIT);
        const known = new Map(pool.map(item => [item.id, item]));
        semanticCandidates = pool.length; semanticTextTruncated = pool.filter(item => item.text.length > SEMANTIC_TEXT).length;
        const projection = pool.map(item => Object.freeze({ id: item.id, text: item.text.slice(0, SEMANTIC_TEXT) }));
        const flight = Promise.resolve().then(() => ranker(keyword, projection, { limit: 20 }));
        semanticFlight = flight;
        flight.then(() => { if (semanticFlight === flight) semanticFlight = null; }, () => { if (semanticFlight === flight) semanticFlight = null; });
        let timer;
        try {
          const rows = await Promise.race([flight, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('semantic timeout'), { code: 'SEARCH_TIMEOUT' })), Math.max(1, Math.min(1200, semanticTimeoutMs))); })]);
          if (!Array.isArray(rows)) throw new Error('invalid semantic result');
          let rank = 0; const seen = new Set();
          for (const row of rows.slice(0, 20)) {
            const item = known.get(row?.item?.id);
            if (!item || seen.has(item.id) || !Number.isFinite(row.score) || row.score < .5 || row.score > 1.000001) continue;
            seen.add(item.id); add(item, ++rank, 'semantic');
          }
          semanticStatus = 'used';
        } catch (error) { semanticStatus = error?.code === 'SEARCH_TIMEOUT' ? 'timeout' : 'failed'; }
        finally { clearTimeout(timer); }
      }
    }
  }
  const direct = [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  const items = direct.map(row => ({ ...row.item, matchBy: row.matchBy }));
  const byId = new Map(candidates.map(item => [item.id, item])), picked = new Set(items.map(item => item.id));
  const seeds = new Set(items.slice(0, 4).map(item => item.id));
  let relations = 0;
  for (const link of [...store.links, ...graph.links]) {
    if (link.status && link.status !== 'active') continue;
    const a = aliases.get(link.source), b = aliases.get(link.target);
    const via = seeds.has(a) ? a : seeds.has(b) ? b : null, target = via === a ? b : a;
    if (!via || !target || picked.has(target) || !byId.has(target) || items.length >= limit || relations >= 3) continue;
    picked.add(target); relations++;
    items.push({ ...byId.get(target), matchBy: ['relation'], via, relation: String(link.relation || link.label || link.kind || '关联').slice(0, 120) });
  }
  return { items, metrics: { scope: groupId ? 'group' : 'private', groupId, coreRevision: store.revision, totalCandidates: candidates.length, duplicateCount: raw.length - candidates.length, lexicalHits: lexical.length, semanticStatus, semanticCandidates, semanticTextTruncated, semanticLimit: SEMANTIC_LIMIT, relationHits: relations, elapsedMs: Math.round((performance.now() - started) * 100) / 100 } };
}

export function formatMemorySearch(result, query) {
  const labels = { core: '我整理的核心记忆：', journal: `检索「${query}」相关的日记：`, life: '相关的小事：', episode: '相关事件：', profile: '旧档案：', learning: '会的事：', groupNote: '群共享记忆：', soul: '我的自我：' };
  const lines = [`当前记忆检索：${result.items.length} 条；候选 ${result.metrics.totalCandidates}；可选语义 ${result.metrics.semanticStatus}（本次最多 ${result.metrics.semanticCandidates} 条候选）。`];
  if (!result.items.length) lines.push('本次未命中当前有效记忆，不要据此猜测答案；可换关键词或按ID读取已有记忆及历史。');
  for (const item of result.items) {
    lines.push(labels[item.layer] || '长期记忆（meow）：');
    let content = item.content;
    if (content.length > 500) {
      const positions = recallTokens(query).map(token => content.toLowerCase().indexOf(token)).filter(at => at >= 0);
      const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 100);
      content = content.slice(start, start + 500) + '〔正文截断；仅为检索节选，不能代替完整原文〕';
    }
    const basis = item.matchBy.includes('relation') ? `直接关联：${item.via} / ${item.relation}` : item.matchBy.map(method => method === 'keyword' ? '关键词' : '语义').join('+');
    lines.push(`- [${item.title || item.layer} / ${item.epistemic}] ${content}（ID：${item.id}；来源：${item.sourceRefs.slice(0, 4).join('、')}${item.sourceRefs.length > 4 ? `等${item.sourceRefs.length}条` : ''}；命中：${basis}）`);
  }
  return lines.join('\n');
}

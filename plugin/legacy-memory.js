/** Content references for legacy records; no file writes or model decisions here. */
import { createHash } from 'node:crypto';

const MEMORY_LAYERS = new Set(['project', 'lesson', 'user', 'rules', 'fact', 'topic', 'soul', 'episode', 'journal', 'life', 'groupNote', 'profile', 'learning']);
export function legacyReference(layer, content) {
  return 'legacy:v1:' + createHash('sha256').update(JSON.stringify([layer, String(content).replace(/\r\n/g, '\n')])).digest('hex');
}
function legacyRecord(node) {
  const content = String(node.content ?? node.text ?? '');
  if (node.coreId || !MEMORY_LAYERS.has(node.layer) || !content.trim()) return null;
  const keywords = Array.isArray(node.keywords) ? node.keywords.map(String).filter((word) => word.length <= 120).slice(0, 20) : [];
  const aliases = [...new Set([...(Array.isArray(node.aliases) ? node.aliases : []), ...(String(node.id).startsWith('mem:') ? [String(node.id)] : [])])];
  return { legacyId: legacyReference(node.layer, content), content, layer: node.layer, label: String(node.label || '').slice(0, 80), nodeIds: [String(node.id)], keywords, aliases, ...(node.slot ? { slot: node.slot } : {}) };
}

/** Exact snapshots, not semantic classifications. No writes or automatic adoption. */
export function auxiliaryLegacyNodes(profile = {}, items = []) {
  const nodes = [];
  const addProfile = (field, value, key) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const slot = { type: 'profile', field, ...(key === undefined ? {} : { key }) };
    const content = JSON.stringify({ field, ...(key === undefined ? {} : { key }), value });
    nodes.push({ id: legacyReference('profile', content), layer: 'profile', label: `${key ?? field}：${value}`.slice(0, 80), content, slot });
  };
  for (const field of ['nickname', 'name', 'birthday']) addProfile(field, profile[field]);
  for (const field of ['likes', 'dislikes', 'boundaries']) for (const value of Array.isArray(profile[field]) ? profile[field] : []) addProfile(field, value);
  for (const [key, value] of Object.entries(profile.facts || {})) addProfile('facts', value, key);
  for (const item of items) {
    if (typeof item.name !== 'string' || !item.name.trim()) continue;
    const name = item.name.trim();
    // Counters and timestamps do not change the meaning or content reference.
    const content = JSON.stringify({ name, note: String(item.note || ''), source: String(item.source || '') });
    nodes.push({ id: legacyReference('learning', content), layer: 'learning', label: name.slice(0, 80), content, slot: { type: 'learning', name: name.toLowerCase() } });
  }
  return nodes;
}

function boundIds(store) {
  return new Set(store.memories.filter(item => item.legacy && !item.legacy.released).map(item => item.legacy.id));
}

export function currentProfile(profile, store) {
  const next = structuredClone(profile), bound = boundIds(store);
  for (const node of auxiliaryLegacyNodes(profile)) {
    if (!bound.has(legacyReference(node.layer, node.content))) continue;
    const { field, key } = node.slot;
    const { value } = JSON.parse(node.content);
    if (field === 'facts') delete next.facts[key];
    else if (Array.isArray(next[field])) next[field] = next[field].filter(item => item !== value);
    else delete next[field];
  }
  return next;
}

export function currentLearning(items, store) {
  const bound = boundIds(store);
  const kept = items.filter(item => !auxiliaryLegacyNodes({}, [item]).some(node => bound.has(legacyReference(node.layer, node.content))));
  const authored = store.memories.filter(item => item.status === 'active' && item.kind === 'skill').map(item => ({
    id: item.id, name: item.content === item.legacy?.originalContent && item.legacy.label ? item.legacy.label : item.content.slice(0, 60), note: item.content, source: 'core-memory', date: item.updatedAt || item.createdAt, managed: true,
  }));
  return [...kept, ...authored];
}

/** A managed slot must be corrected by an explicit model decision, never a second file write. */
export function assertLegacyWriteAllowed(store, slot) {
  const sameSlot = value => value.type === slot.type && value.field === slot.field && value.key === slot.key && value.name === slot.name;
  const managed = store.memories.filter(item => item.legacy?.slot && !item.legacy.released).filter(item => sameSlot(item.legacy.slot));
  if (managed.length) throw new Error(`此旧入口已交给核心记忆管理；未写入旧文件。请用 love_core_memory read/legacy 查看，再用 record_memory、attach_source 或 supersede_memory 处理；由你决定内容和归属。迁移ID：${managed.map(item => item.id).join(', ')}`);
}

export function legacyCandidates(graph, store, { maxContentLength = 4000 } = {}) {
  const bound = new Set(store.memories.filter((item) => item.legacy && !item.legacy.released).map((item) => item.legacy.id));
  const candidates = new Map(), excluded = [];
  for (const node of graph.nodes) {
    const item = legacyRecord(node);
    if (!item || bound.has(item.legacyId)) continue;
    if (item.content.length > maxContentLength) { excluded.push({ legacyId: item.legacyId, reason: '原文超过 4000 字符，未截断迁移' }); continue; }
    const existing = candidates.get(item.legacyId);
    if (existing) {
      existing.nodeIds.push(...item.nodeIds);
      existing.keywords = [...new Set([...existing.keywords, ...item.keywords])].slice(0, 20);
      existing.aliases = [...new Set([...existing.aliases, ...item.aliases])];
    } else candidates.set(item.legacyId, item);
  }
  return { candidates: [...candidates.values()], excluded };
}

/** Replace only bound legacy nodes, preserving their original edge endpoints. */
export function mergeLegacyGraph(nodes, links, authored) {
  const bindings = new Map((authored.legacyBindings || []).map((item) => [item.legacyId, item.active ? item.memoryId : null]));
  if (!bindings.size) return { nodes: [...nodes, ...authored.nodes], links: [...links, ...authored.links] };
  const replacements = new Map();
  const kept = nodes.filter((node) => {
    const item = legacyRecord(node);
    if (!item || !bindings.has(item.legacyId)) return true;
    replacements.set(node.id, bindings.get(item.legacyId));
    return false;
  });
  const endpoint = (id) => replacements.has(id) ? replacements.get(id) : id;
  const seen = new Set();
  const mergedLinks = [...links.map((link) => ({ ...link, source: endpoint(link.source), target: endpoint(link.target) })), ...authored.links].filter((link) => {
    if (!link.source || !link.target || link.source === link.target) return false;
    const key = JSON.stringify([link.source, link.target, link.kind || link.relation || '', link.label || '']);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { nodes: [...kept, ...authored.nodes], links: mergedLinks };
}
